<?php

class Auth
{
    private $conn;
    private $studentTable = 'students';
    private $teacherTable = 'teachers';
    private $teacherMiddleNameColumnChecked = false;
    private $teacherHasMiddleNameColumn = false;
    private $passwordResetOtpTtl = 600;
    private $passwordResetOtpCooldown = 60;
    private $passwordResetOtpMaxAttempts = 5;

    public function __construct($db)
    {
        $this->conn = $db;
    }

    private function startSession()
    {
        require_once __DIR__ . '/SessionConfig.php';
    }

    private function clearAuthSession()
    {
        unset($_SESSION['auth_role']);
        unset($_SESSION['student_pk_id']);
        unset($_SESSION['teacher_id']);
    }

    private function validatePasswordPolicy($password)
    {
        if (strlen($password) < 8) {
            return 'Password must be at least 8 characters.';
        }

        if (!preg_match('/\d/', $password)) {
            return 'Password must include at least 1 number.';
        }

        if (!preg_match('/[a-z]/', $password)) {
            return 'Password must include at least 1 lowercase letter.';
        }

        if (!preg_match('/[A-Z]/', $password)) {
            return 'Password must include at least 1 uppercase letter.';
        }

        return null;
    }

    private function normalizeEmail($email)
    {
        return strtolower(trim((string)$email));
    }

    private function normalizeComparableText($value)
    {
        $value = preg_replace('/\s+/', ' ', trim((string)$value));
        return strtolower((string)$value);
    }

    private function passwordResetOtpStateKey($scope)
    {
        return 'password_reset_otp_' . trim((string)$scope);
    }

    private function getPasswordResetOtpState($scope)
    {
        $this->startSession();
        $key = $this->passwordResetOtpStateKey($scope);
        $state = $_SESSION[$key] ?? null;

        return is_array($state) ? $state : null;
    }

    private function setPasswordResetOtpState($scope, $state)
    {
        $this->startSession();
        $key = $this->passwordResetOtpStateKey($scope);
        $_SESSION[$key] = $state;
    }

    private function clearPasswordResetOtpState($scope)
    {
        $this->startSession();
        $key = $this->passwordResetOtpStateKey($scope);
        unset($_SESSION[$key]);
    }

    private function generateSixDigitOtp()
    {
        return str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    private function hashOtpCode($otp)
    {
        return hash('sha256', (string)$otp);
    }

    private function maskEmailAddress($email)
    {
        $email = trim((string)$email);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return 'your email address';
        }

        [$local, $domain] = explode('@', $email, 2);
        if ($local === '') {
            return 'your email address';
        }

        if (strlen($local) <= 2) {
            $maskedLocal = substr($local, 0, 1) . '*';
        } else {
            $maskedLocal = substr($local, 0, 1)
                . str_repeat('*', max(1, strlen($local) - 2))
                . substr($local, -1);
        }

        return $maskedLocal . '@' . $domain;
    }

    private function sendPasswordResetOtpEmail($email, $recipientName, $otpCode, $accountLabel)
    {
        require_once __DIR__ . '/EmailService.php';
        $emailService = new EmailService($this->conn);

        return $emailService->sendPasswordResetOtp(
            (string)$email,
            (string)$recipientName,
            (string)$otpCode,
            (string)$accountLabel
        );
    }

    private function hasTeacherMiddleNameColumn()
    {
        if ($this->teacherMiddleNameColumnChecked) {
            return $this->teacherHasMiddleNameColumn;
        }

        $this->teacherMiddleNameColumnChecked = true;
        $this->teacherHasMiddleNameColumn = false;

        try {
            $query = "SHOW COLUMNS FROM {$this->teacherTable} LIKE 'middle_name'";
            $stmt = $this->conn->prepare($query);
            $stmt->execute();
            $this->teacherHasMiddleNameColumn = (bool)$stmt->fetch(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            $this->teacherHasMiddleNameColumn = false;
        }

        return $this->teacherHasMiddleNameColumn;
    }

    private function ensureTeacherMiddleNameColumn()
    {
        if ($this->hasTeacherMiddleNameColumn()) {
            return true;
        }

        try {
            $sql = "ALTER TABLE {$this->teacherTable} ADD COLUMN middle_name VARCHAR(255) NULL AFTER first_name";
            $this->conn->exec($sql);
            $this->teacherMiddleNameColumnChecked = false;
        } catch (Exception $e) {
            // Keep silent here and let caller decide fallback behavior.
        }

        return $this->hasTeacherMiddleNameColumn();
    }

    private function buildTeacherDisplayName($firstName, $middleName, $lastName)
    {
        $parts = [];
        $first = trim((string)$firstName);
        $middle = trim((string)$middleName);
        $last = trim((string)$lastName);

        if ($first !== '') {
            $parts[] = $first;
        }
        if ($middle !== '') {
            $parts[] = $middle;
        }
        if ($last !== '') {
            $parts[] = $last;
        }

        $name = trim(implode(' ', $parts));
        return $name !== '' ? $name : 'Instructor';
    }

    public function studentLogin($email, $password)
    {
        $email = trim((string)$email);
        $password = (string)$password;

        if ($email === '' || $password === '') {
            return [
                'status' => 'error',
                'message' => 'Email and password are required.'
            ];
        }

        // Fetch student by their email address
        $query = "SELECT id, student_id, first_name, last_name, email, parent_email, course, year_level, section, password
                  FROM {$this->studentTable}
                  WHERE email = :email
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([':email' => $email]);
        $student = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$student || !password_verify($password, $student['password'])) {
            return [
                'status' => 'error',
                'message' => 'Invalid credentials.'
            ];
        }

        $this->startSession();
        session_regenerate_id(true);
        $this->clearAuthSession();

        $_SESSION['auth_role'] = 'student';
        $_SESSION['student_pk_id'] = (int)$student['id'];

        unset($student['password']);

        return [
            'status' => 'success',
            'message' => 'Welcome back, ' . $student['first_name'] . '!',
            'student' => $student
        ];
    }

    public function teacherLogin($email, $password)
    {
        $email = trim((string)$email);
        $password = (string)$password;

        if ($email === '' || $password === '') {
            return [
                'status' => 'error',
                'message' => 'Email and password are required.'
            ];
        }

        $middleNameSelect = $this->hasTeacherMiddleNameColumn() ? ', middle_name' : '';
        $query = "SELECT id, email, first_name{$middleNameSelect}, last_name, department, password
                  FROM {$this->teacherTable}
                  WHERE email = :email
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([':email' => $email]);
        $teacher = $stmt->fetch(PDO::FETCH_ASSOC);

        if (is_array($teacher) && !array_key_exists('middle_name', $teacher)) {
            $teacher['middle_name'] = '';
        }

        if (!$teacher || !password_verify($password, $teacher['password'])) {
            return [
                'status' => 'error',
                'message' => 'The provided credentials do not match our records.'
            ];
        }

        $this->startSession();
        session_regenerate_id(true);
        $this->clearAuthSession();

        $_SESSION['auth_role'] = 'teacher';
        $_SESSION['teacher_id'] = (int)$teacher['id'];

        unset($teacher['password']);

        return [
            'status' => 'success',
            'message' => 'Welcome back, ' . $teacher['first_name'] . '!',
            'teacher' => $teacher
        ];
    }

    public function teacherSendRegisterOtp($firstName, $middleName, $lastName, $email, $department)
    {
        $firstName = trim((string)$firstName);
        $middleName = trim((string)$middleName);
        $lastName = trim((string)$lastName);
        $email = trim((string)$email);
        $department = trim((string)$department);

        if ($firstName === '' || $lastName === '' || $email === '' || $department === '') {
            return [
                'status' => 'error',
                'message' => 'first_name, last_name, email, and department are required.'
            ];
        }

        if (
            strlen($firstName) > 255
            || strlen($middleName) > 255
            || strlen($lastName) > 255
            || strlen($department) > 255
        ) {
            return [
                'status' => 'error',
                'message' => 'Name and department fields must not exceed 255 characters.'
            ];
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return [
                'status' => 'error',
                'message' => 'Please enter a valid email address.'
            ];
        }

        if (!preg_match('/^[a-zA-Z0-9._%+-]+@wmsu\\.edu\\.ph$/', $email)) {
            return [
                'status' => 'error',
                'message' => 'Please use a valid WMSU email address (@wmsu.edu.ph).'
            ];
        }

        $existsQuery = "SELECT id FROM {$this->teacherTable} WHERE email = :email LIMIT 1";
        $existsStmt = $this->conn->prepare($existsQuery);
        $existsStmt->execute([':email' => $email]);

        if ($existsStmt->fetch(PDO::FETCH_ASSOC)) {
            return [
                'status' => 'error',
                'message' => 'This email is already registered.'
            ];
        }

        $scope = 'teacher_register';
        $state = $this->getPasswordResetOtpState($scope);
        $now = time();
        $normalizedEmail = $this->normalizeEmail($email);

        if (
            is_array($state)
            && $normalizedEmail === $this->normalizeEmail($state['email'] ?? '')
            && $now < (int)($state['resend_available_at'] ?? 0)
        ) {
            return [
                'status' => 'error',
                'message' => 'Please wait before requesting another OTP code.',
                'resend_in' => max(1, (int)$state['resend_available_at'] - $now),
            ];
        }

        $otpCode = $this->generateSixDigitOtp();
        $displayName = $this->buildTeacherDisplayName($firstName, $middleName, $lastName);

        $sendResult = $this->sendPasswordResetOtpEmail(
            $email,
            $displayName,
            $otpCode,
            'Instructor Registration'
        );

        if (!($sendResult['success'] ?? false)) {
            return [
                'status' => 'error',
                'message' => (string)($sendResult['message'] ?? 'Unable to send OTP email right now. Please try again.'),
            ];
        }

        $this->setPasswordResetOtpState($scope, [
            'email' => $normalizedEmail,
            'first_name' => $firstName,
            'middle_name' => $middleName,
            'last_name' => $lastName,
            'department' => $department,
            'otp_hash' => $this->hashOtpCode($otpCode),
            'sent_at' => $now,
            'expires_at' => $now + $this->passwordResetOtpTtl,
            'resend_available_at' => $now + $this->passwordResetOtpCooldown,
            'attempts' => 0,
            'verified' => false,
            'verified_at' => 0,
        ]);

        return [
            'status' => 'success',
            'message' => 'We have sent a 6-digit OTP to your email address.',
            'destination' => $this->maskEmailAddress($email),
            'resend_in' => $this->passwordResetOtpCooldown,
            'expires_in' => $this->passwordResetOtpTtl,
        ];
    }

    public function teacherVerifyRegisterOtp($email, $otp)
    {
        $email = trim((string)$email);
        $otp = preg_replace('/\D+/', '', (string)$otp);

        if ($email === '' || $otp === '') {
            return [
                'status' => 'error',
                'message' => 'Email and OTP are required.'
            ];
        }

        if (!preg_match('/^\d{6}$/', $otp)) {
            return [
                'status' => 'error',
                'message' => 'OTP must be a 6-digit code.'
            ];
        }

        $scope = 'teacher_register';
        $state = $this->getPasswordResetOtpState($scope);
        if (!is_array($state) || $this->normalizeEmail($email) !== $this->normalizeEmail($state['email'] ?? '')) {
            return [
                'status' => 'error',
                'message' => 'Please request a new OTP code first.'
            ];
        }

        $now = time();
        if ($now > (int)($state['expires_at'] ?? 0)) {
            $this->clearPasswordResetOtpState($scope);
            return [
                'status' => 'error',
                'message' => 'OTP has expired. Please request a new one.'
            ];
        }

        $attempts = (int)($state['attempts'] ?? 0);
        if ($attempts >= $this->passwordResetOtpMaxAttempts) {
            $this->clearPasswordResetOtpState($scope);
            return [
                'status' => 'error',
                'message' => 'Too many invalid attempts. Please request a new OTP.'
            ];
        }

        $isValidOtp = hash_equals((string)($state['otp_hash'] ?? ''), $this->hashOtpCode($otp));
        if (!$isValidOtp) {
            $attempts++;
            $state['attempts'] = $attempts;
            $this->setPasswordResetOtpState($scope, $state);

            $attemptsLeft = max(0, $this->passwordResetOtpMaxAttempts - $attempts);
            if ($attemptsLeft <= 0) {
                $this->clearPasswordResetOtpState($scope);
                return [
                    'status' => 'error',
                    'message' => 'Too many invalid attempts. Please request a new OTP.'
                ];
            }

            return [
                'status' => 'error',
                'message' => 'Invalid OTP code.',
                'attempts_left' => $attemptsLeft,
            ];
        }

        $state['verified'] = true;
        $state['verified_at'] = $now;
        $state['otp_hash'] = '';
        $this->setPasswordResetOtpState($scope, $state);

        return [
            'status' => 'success',
            'message' => 'OTP verified successfully. You can now create your account.'
        ];
    }

    public function teacherRegister($firstName, $lastName, $email, $department, $password, $passwordConfirmation, $middleName = '')
    {
        $firstName = trim((string)$firstName);
        $middleName = trim((string)$middleName);
        $lastName = trim((string)$lastName);
        $email = trim((string)$email);
        $department = trim((string)$department);
        $password = (string)$password;
        $passwordConfirmation = (string)$passwordConfirmation;

        if ($firstName === '' || $lastName === '' || $email === '' || $department === '' || $password === '' || $passwordConfirmation === '') {
            return [
                'status' => 'error',
                'message' => 'first_name, last_name, email, department, password, and password_confirmation are required.'
            ];
        }

        if (
            strlen($firstName) > 255
            || strlen($middleName) > 255
            || strlen($lastName) > 255
            || strlen($department) > 255
        ) {
            return [
                'status' => 'error',
                'message' => 'Name and department fields must not exceed 255 characters.'
            ];
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return [
                'status' => 'error',
                'message' => 'Please enter a valid email address.'
            ];
        }

        if (!preg_match('/^[a-zA-Z0-9._%+-]+@wmsu\\.edu\\.ph$/', $email)) {
            return [
                'status' => 'error',
                'message' => 'Please use a valid WMSU email address (@wmsu.edu.ph).'
            ];
        }

        if ($password !== $passwordConfirmation) {
            return [
                'status' => 'error',
                'message' => 'Password confirmation does not match.'
            ];
        }

        $passwordPolicyError = $this->validatePasswordPolicy($password);
        if ($passwordPolicyError !== null) {
            return [
                'status' => 'error',
                'message' => $passwordPolicyError
            ];
        }

        $existsQuery = "SELECT id FROM {$this->teacherTable} WHERE email = :email LIMIT 1";
        $existsStmt = $this->conn->prepare($existsQuery);
        $existsStmt->execute([':email' => $email]);

        if ($existsStmt->fetch(PDO::FETCH_ASSOC)) {
            return [
                'status' => 'error',
                'message' => 'This email is already registered.'
            ];
        }

        $scope = 'teacher_register';
        $otpState = $this->getPasswordResetOtpState($scope);
        if (
            !is_array($otpState)
            || $this->normalizeEmail($email) !== $this->normalizeEmail($otpState['email'] ?? '')
            || !($otpState['verified'] ?? false)
        ) {
            return [
                'status' => 'error',
                'message' => 'Please complete OTP verification before creating your account.'
            ];
        }

        $verifiedAt = (int)($otpState['verified_at'] ?? 0);
        if ($verifiedAt <= 0 || time() - $verifiedAt > 900) {
            $this->clearPasswordResetOtpState($scope);
            return [
                'status' => 'error',
                'message' => 'OTP verification expired. Please request and verify a new OTP.'
            ];
        }

        if (
            $this->normalizeComparableText($firstName) !== $this->normalizeComparableText($otpState['first_name'] ?? '')
            || $this->normalizeComparableText($middleName) !== $this->normalizeComparableText($otpState['middle_name'] ?? '')
            || $this->normalizeComparableText($lastName) !== $this->normalizeComparableText($otpState['last_name'] ?? '')
            || $this->normalizeComparableText($department) !== $this->normalizeComparableText($otpState['department'] ?? '')
        ) {
            return [
                'status' => 'error',
                'message' => 'Registration details changed. Please request and verify a new OTP.'
            ];
        }

        $hasMiddleNameColumn = $this->ensureTeacherMiddleNameColumn();
        if ($middleName !== '' && !$hasMiddleNameColumn) {
            return [
                'status' => 'error',
                'message' => 'Unable to store middle name. Please update your teacher table schema and try again.'
            ];
        }

        $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

        if ($hasMiddleNameColumn) {
            $insertQuery = "INSERT INTO {$this->teacherTable}
                            (email, first_name, middle_name, last_name, department, password, created_at, updated_at)
                            VALUES
                            (:email, :first_name, :middle_name, :last_name, :department, :password, NOW(), NOW())";
            $insertStmt = $this->conn->prepare($insertQuery);
            $insertStmt->execute([
                ':email' => $email,
                ':first_name' => $firstName,
                ':middle_name' => $middleName !== '' ? $middleName : null,
                ':last_name' => $lastName,
                ':department' => $department,
                ':password' => $hashedPassword,
            ]);
        } else {
            $insertQuery = "INSERT INTO {$this->teacherTable}
                            (email, first_name, last_name, department, password, created_at, updated_at)
                            VALUES
                            (:email, :first_name, :last_name, :department, :password, NOW(), NOW())";
            $insertStmt = $this->conn->prepare($insertQuery);
            $insertStmt->execute([
                ':email' => $email,
                ':first_name' => $firstName,
                ':last_name' => $lastName,
                ':department' => $department,
                ':password' => $hashedPassword,
            ]);
        }

        $this->clearPasswordResetOtpState($scope);

        return [
            'status' => 'success',
            'message' => 'Teacher account created successfully. You can now log in.'
        ];
    }

    public function teacherSendResetOtp($email)
    {
        $email = trim((string)$email);

        if ($email === '') {
            return [
                'status' => 'error',
                'message' => 'Email is required.'
            ];
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return [
                'status' => 'error',
                'message' => 'Please enter a valid email address.'
            ];
        }

        if (!preg_match('/^[a-zA-Z0-9._%+-]+@wmsu\\.edu\\.ph$/', $email)) {
            return [
                'status' => 'error',
                'message' => 'Please use a valid WMSU email address (@wmsu.edu.ph).'
            ];
        }

        $query = "SELECT id, first_name, last_name
                  FROM {$this->teacherTable}
                  WHERE email = :email
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([':email' => $email]);
        $teacher = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$teacher) {
            return [
                'status' => 'error',
                'message' => 'This email is not registered in our system.'
            ];
        }

        $state = $this->getPasswordResetOtpState('teacher');
        $now = time();
        $normalizedEmail = $this->normalizeEmail($email);

        if (
            is_array($state)
            && $normalizedEmail === $this->normalizeEmail($state['email'] ?? '')
            && $now < (int)($state['resend_available_at'] ?? 0)
        ) {
            return [
                'status' => 'error',
                'message' => 'Please wait before requesting another OTP code.',
                'resend_in' => max(1, (int)$state['resend_available_at'] - $now),
            ];
        }

        $otpCode = $this->generateSixDigitOtp();
        $teacherName = trim((string)($teacher['first_name'] ?? '') . ' ' . (string)($teacher['last_name'] ?? ''));

        $sendResult = $this->sendPasswordResetOtpEmail(
            $email,
            $teacherName,
            $otpCode,
            'Teacher Account'
        );

        if (!($sendResult['success'] ?? false)) {
            return [
                'status' => 'error',
                'message' => (string)($sendResult['message'] ?? 'Unable to send OTP email right now. Please try again.'),
            ];
        }

        $this->setPasswordResetOtpState('teacher', [
            'email' => $normalizedEmail,
            'teacher_id' => (int)$teacher['id'],
            'otp_hash' => $this->hashOtpCode($otpCode),
            'sent_at' => $now,
            'expires_at' => $now + $this->passwordResetOtpTtl,
            'resend_available_at' => $now + $this->passwordResetOtpCooldown,
            'attempts' => 0,
            'verified' => false,
            'verified_at' => 0,
        ]);

        return [
            'status' => 'success',
            'message' => 'We have sent a 6-digit OTP to your email address.',
            'destination' => $this->maskEmailAddress($email),
            'resend_in' => $this->passwordResetOtpCooldown,
            'expires_in' => $this->passwordResetOtpTtl,
        ];
    }

    public function teacherVerifyResetOtp($email, $otp)
    {
        $email = trim((string)$email);
        $otp = preg_replace('/\D+/', '', (string)$otp);

        if ($email === '' || $otp === '') {
            return [
                'status' => 'error',
                'message' => 'Email and OTP are required.'
            ];
        }

        if (!preg_match('/^\d{6}$/', $otp)) {
            return [
                'status' => 'error',
                'message' => 'OTP must be a 6-digit code.'
            ];
        }

        $state = $this->getPasswordResetOtpState('teacher');
        if (!is_array($state) || $this->normalizeEmail($email) !== $this->normalizeEmail($state['email'] ?? '')) {
            return [
                'status' => 'error',
                'message' => 'Please request a new OTP code first.'
            ];
        }

        $now = time();
        if ($now > (int)($state['expires_at'] ?? 0)) {
            $this->clearPasswordResetOtpState('teacher');
            return [
                'status' => 'error',
                'message' => 'OTP has expired. Please request a new one.'
            ];
        }

        $attempts = (int)($state['attempts'] ?? 0);
        if ($attempts >= $this->passwordResetOtpMaxAttempts) {
            $this->clearPasswordResetOtpState('teacher');
            return [
                'status' => 'error',
                'message' => 'Too many invalid attempts. Please request a new OTP.'
            ];
        }

        $isValidOtp = hash_equals((string)($state['otp_hash'] ?? ''), $this->hashOtpCode($otp));
        if (!$isValidOtp) {
            $attempts++;
            $state['attempts'] = $attempts;
            $this->setPasswordResetOtpState('teacher', $state);

            $attemptsLeft = max(0, $this->passwordResetOtpMaxAttempts - $attempts);
            if ($attemptsLeft <= 0) {
                $this->clearPasswordResetOtpState('teacher');
                return [
                    'status' => 'error',
                    'message' => 'Too many invalid attempts. Please request a new OTP.'
                ];
            }

            return [
                'status' => 'error',
                'message' => 'Invalid OTP code.',
                'attempts_left' => $attemptsLeft,
            ];
        }

        $state['verified'] = true;
        $state['verified_at'] = $now;
        $state['otp_hash'] = '';
        $this->setPasswordResetOtpState('teacher', $state);

        return [
            'status' => 'success',
            'message' => 'OTP verified successfully. You can now reset your password.'
        ];
    }

    public function teacherResetPassword($email, $password, $passwordConfirmation)
    {
        $email = trim((string)$email);
        $password = (string)$password;
        $passwordConfirmation = (string)$passwordConfirmation;

        if ($email === '' || $password === '' || $passwordConfirmation === '') {
            return [
                'status' => 'error',
                'message' => 'Email, password, and password confirmation are required.'
            ];
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return [
                'status' => 'error',
                'message' => 'Please enter a valid email address.'
            ];
        }

        if (!preg_match('/^[a-zA-Z0-9._%+-]+@wmsu\\.edu\\.ph$/', $email)) {
            return [
                'status' => 'error',
                'message' => 'Please enter a valid WMSU email address (@wmsu.edu.ph).'
            ];
        }

        if ($password !== $passwordConfirmation) {
            return [
                'status' => 'error',
                'message' => 'Password confirmation does not match.'
            ];
        }

        $passwordPolicyError = $this->validatePasswordPolicy($password);
        if ($passwordPolicyError !== null) {
            return [
                'status' => 'error',
                'message' => $passwordPolicyError
            ];
        }

        $query = "SELECT id FROM {$this->teacherTable} WHERE email = :email LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([':email' => $email]);
        $teacher = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$teacher) {
            return [
                'status' => 'error',
                'message' => 'This email is not registered in our system.'
            ];
        }

        $otpState = $this->getPasswordResetOtpState('teacher');
        $normalizedEmail = $this->normalizeEmail($email);
        if (
            !is_array($otpState)
            || $normalizedEmail !== $this->normalizeEmail($otpState['email'] ?? '')
            || (int)($otpState['teacher_id'] ?? 0) !== (int)$teacher['id']
            || !($otpState['verified'] ?? false)
        ) {
            return [
                'status' => 'error',
                'message' => 'Please complete OTP verification before resetting your password.'
            ];
        }

        $verifiedAt = (int)($otpState['verified_at'] ?? 0);
        if ($verifiedAt <= 0 || time() - $verifiedAt > 900) {
            $this->clearPasswordResetOtpState('teacher');
            return [
                'status' => 'error',
                'message' => 'OTP verification expired. Please request and verify a new OTP.'
            ];
        }

        $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

        $updateQuery = "UPDATE {$this->teacherTable}
                        SET password = :password, updated_at = NOW()
                        WHERE id = :id";
        $updateStmt = $this->conn->prepare($updateQuery);
        $updateStmt->execute([
            ':password' => $hashedPassword,
            ':id' => (int)$teacher['id']
        ]);

        $this->clearPasswordResetOtpState('teacher');

        return [
            'status' => 'success',
            'message' => 'Your password has been reset successfully.'
        ];
    }

    public function studentSendResetOtp($email, $parentEmail)
    {
        $email = trim((string)$email);
        $parentEmail = trim((string)$parentEmail);

        if ($email === '' || $parentEmail === '') {
            return [
                'status' => 'error',
                'message' => 'Student email and parent email are required.'
            ];
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return [
                'status' => 'error',
                'message' => 'Please enter a valid student email address.'
            ];
        }

        if (!filter_var($parentEmail, FILTER_VALIDATE_EMAIL)) {
            return [
                'status' => 'error',
                'message' => 'Please enter a valid parent email address.'
            ];
        }

        // Fetch student by their email address
        $query = "SELECT id, first_name, last_name, parent_email
                  FROM {$this->studentTable}
                  WHERE email = :email
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([':email' => $email]);
        $student = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$student) {
            return [
                'status' => 'error',
                'message' => 'This email is not registered in our system.'
            ];
        }

        $storedParentEmail = trim((string)($student['parent_email'] ?? ''));
        if ($storedParentEmail === '' || strcasecmp($storedParentEmail, $parentEmail) !== 0) {
            return [
                'status' => 'error',
                'message' => 'The parent email does not match our records.'
            ];
        }

        $state = $this->getPasswordResetOtpState('student');
        $now = time();
        $normalizedParentEmail = $this->normalizeEmail($parentEmail);
        $normalizedEmail = $this->normalizeEmail($email);

        if (
            is_array($state)
            && $normalizedEmail === $this->normalizeEmail($state['email'] ?? '')
            && $normalizedParentEmail === $this->normalizeEmail($state['parent_email'] ?? '')
            && $now < (int)($state['resend_available_at'] ?? 0)
        ) {
            return [
                'status' => 'error',
                'message' => 'Please wait before requesting another OTP code.',
                'resend_in' => max(1, (int)$state['resend_available_at'] - $now),
            ];
        }

        $otpCode = $this->generateSixDigitOtp();
        $studentName = trim((string)($student['first_name'] ?? '') . ' ' . (string)($student['last_name'] ?? ''));
        $recipientName = $studentName !== '' ? ('Parent of ' . $studentName) : 'Parent/Guardian';

        $sendResult = $this->sendPasswordResetOtpEmail(
            $parentEmail,
            $recipientName,
            $otpCode,
            'Student Account'
        );

        if (!($sendResult['success'] ?? false)) {
            return [
                'status' => 'error',
                'message' => (string)($sendResult['message'] ?? 'Unable to send OTP email right now. Please try again.'),
            ];
        }

        $this->setPasswordResetOtpState('student', [
            'email' => $normalizedEmail,
            'student_pk_id' => (int)$student['id'],
            'parent_email' => $normalizedParentEmail,
            'otp_hash' => $this->hashOtpCode($otpCode),
            'sent_at' => $now,
            'expires_at' => $now + $this->passwordResetOtpTtl,
            'resend_available_at' => $now + $this->passwordResetOtpCooldown,
            'attempts' => 0,
            'verified' => false,
            'verified_at' => 0,
        ]);

        return [
            'status' => 'success',
            'message' => 'We have sent a 6-digit OTP to your parent email address.',
            'destination' => $this->maskEmailAddress($parentEmail),
            'resend_in' => $this->passwordResetOtpCooldown,
            'expires_in' => $this->passwordResetOtpTtl,
        ];
    }

    public function studentVerifyResetOtp($email, $parentEmail, $otp)
    {
        $email = trim((string)$email);
        $parentEmail = trim((string)$parentEmail);
        $otp = preg_replace('/\D+/', '', (string)$otp);

        if ($email === '' || $parentEmail === '' || $otp === '') {
            return [
                'status' => 'error',
                'message' => 'Student email, parent email, and OTP are required.'
            ];
        }

        if (!preg_match('/^\d{6}$/', $otp)) {
            return [
                'status' => 'error',
                'message' => 'OTP must be a 6-digit code.'
            ];
        }

        $state = $this->getPasswordResetOtpState('student');
        if (
            !is_array($state)
            || $this->normalizeEmail($email) !== $this->normalizeEmail($state['email'] ?? '')
            || $this->normalizeEmail($parentEmail) !== $this->normalizeEmail($state['parent_email'] ?? '')
        ) {
            return [
                'status' => 'error',
                'message' => 'Please request a new OTP code first.'
            ];
        }

        $now = time();
        if ($now > (int)($state['expires_at'] ?? 0)) {
            $this->clearPasswordResetOtpState('student');
            return [
                'status' => 'error',
                'message' => 'OTP has expired. Please request a new one.'
            ];
        }

        $attempts = (int)($state['attempts'] ?? 0);
        if ($attempts >= $this->passwordResetOtpMaxAttempts) {
            $this->clearPasswordResetOtpState('student');
            return [
                'status' => 'error',
                'message' => 'Too many invalid attempts. Please request a new OTP.'
            ];
        }

        $isValidOtp = hash_equals((string)($state['otp_hash'] ?? ''), $this->hashOtpCode($otp));
        if (!$isValidOtp) {
            $attempts++;
            $state['attempts'] = $attempts;
            $this->setPasswordResetOtpState('student', $state);

            $attemptsLeft = max(0, $this->passwordResetOtpMaxAttempts - $attempts);
            if ($attemptsLeft <= 0) {
                $this->clearPasswordResetOtpState('student');
                return [
                    'status' => 'error',
                    'message' => 'Too many invalid attempts. Please request a new OTP.'
                ];
            }

            return [
                'status' => 'error',
                'message' => 'Invalid OTP code.',
                'attempts_left' => $attemptsLeft,
            ];
        }

        $state['verified'] = true;
        $state['verified_at'] = $now;
        $state['otp_hash'] = '';
        $this->setPasswordResetOtpState('student', $state);

        return [
            'status' => 'success',
            'message' => 'OTP verified successfully. You can now reset your password.'
        ];
    }

    public function studentResetPassword($email, $parentEmail, $password, $passwordConfirmation)
    {
        $email = trim((string)$email);
        $parentEmail = trim((string)$parentEmail);
        $password = (string)$password;
        $passwordConfirmation = (string)$passwordConfirmation;

        if ($email === '' || $parentEmail === '' || $password === '' || $passwordConfirmation === '') {
            return [
                'status' => 'error',
                'message' => 'Student email, parent email, password, and password confirmation are required.'
            ];
        }

        if (!filter_var($parentEmail, FILTER_VALIDATE_EMAIL)) {
            return [
                'status' => 'error',
                'message' => 'Please enter a valid parent email address.'
            ];
        }

        if ($password !== $passwordConfirmation) {
            return [
                'status' => 'error',
                'message' => 'Password confirmation does not match.'
            ];
        }

        $passwordPolicyError = $this->validatePasswordPolicy($password);
        if ($passwordPolicyError !== null) {
            return [
                'status' => 'error',
                'message' => $passwordPolicyError
            ];
        }

        // Fetch student by email
        $query = "SELECT id, parent_email
                  FROM {$this->studentTable}
                  WHERE email = :email
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([':email' => $email]);
        $student = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$student) {
            return [
                'status' => 'error',
                'message' => 'This email is not registered in our system.'
            ];
        }

        $storedParentEmail = trim((string)($student['parent_email'] ?? ''));
        if ($storedParentEmail === '' || strcasecmp($storedParentEmail, $parentEmail) !== 0) {
            return [
                'status' => 'error',
                'message' => 'The parent email does not match our records.'
            ];
        }

        $otpState = $this->getPasswordResetOtpState('student');
        if (
            !is_array($otpState)
            || $this->normalizeEmail($email) !== $this->normalizeEmail($otpState['email'] ?? '')
            || $this->normalizeEmail($parentEmail) !== $this->normalizeEmail($otpState['parent_email'] ?? '')
            || (int)($otpState['student_pk_id'] ?? 0) !== (int)$student['id']
            || !($otpState['verified'] ?? false)
        ) {
            return [
                'status' => 'error',
                'message' => 'Please complete OTP verification before resetting your password.'
            ];
        }

        $verifiedAt = (int)($otpState['verified_at'] ?? 0);
        if ($verifiedAt <= 0 || time() - $verifiedAt > 900) {
            $this->clearPasswordResetOtpState('student');
            return [
                'status' => 'error',
                'message' => 'OTP verification expired. Please request and verify a new OTP.'
            ];
        }

        $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

        $updateQuery = "UPDATE {$this->studentTable}
                        SET password = :password, updated_at = NOW()
                        WHERE id = :id";
        $updateStmt = $this->conn->prepare($updateQuery);
        $updateStmt->execute([
            ':password' => $hashedPassword,
            ':id' => (int)$student['id']
        ]);

        $this->clearPasswordResetOtpState('student');

        return [
            'status' => 'success',
            'message' => 'Your password has been reset successfully.'
        ];
    }

    public function currentTeacher()
    {
        $this->startSession();

        if (!$this->isTeacherLoggedIn()) {
            return [
                'status' => 'error',
                'message' => 'Unauthorized'
            ];
        }

        $middleNameSelect = $this->hasTeacherMiddleNameColumn() ? ', middle_name' : '';
        $query = "SELECT id, email, first_name{$middleNameSelect}, last_name, department
                  FROM {$this->teacherTable}
                  WHERE id = :id
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([':id' => (int)$_SESSION['teacher_id']]);
        $teacher = $stmt->fetch(PDO::FETCH_ASSOC);

        if (is_array($teacher) && !array_key_exists('middle_name', $teacher)) {
            $teacher['middle_name'] = '';
        }

        if (!$teacher) {
            return [
                'status' => 'error',
                'message' => 'Unauthorized'
            ];
        }

        return [
            'status' => 'success',
            'teacher' => $teacher
        ];
    }

    public function currentStudent()
    {
        $this->startSession();

        if (!$this->isStudentLoggedIn()) {
            return [
                'status' => 'error',
                'message' => 'Unauthorized'
            ];
        }

        $query = "SELECT id, student_id, first_name, last_name, email, parent_email, course, year_level, section
                  FROM {$this->studentTable}
                  WHERE id = :id
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([':id' => (int)$_SESSION['student_pk_id']]);
        $student = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$student) {
            return [
                'status' => 'error',
                'message' => 'Unauthorized'
            ];
        }

        return [
            'status' => 'success',
            'student' => $student
        ];
    }

    public function studentLoginById($studentPkId)
    {
        $this->startSession();
        session_regenerate_id(true);
        $this->clearAuthSession();
        $_SESSION['auth_role'] = 'student';
        $_SESSION['student_pk_id'] = (int)$studentPkId;
    }

    public function isTeacherLoggedIn()
    {
        $this->startSession();
        return isset($_SESSION['auth_role'], $_SESSION['teacher_id']) && $_SESSION['auth_role'] === 'teacher';
    }

    public function isStudentLoggedIn()
    {
        $this->startSession();
        return isset($_SESSION['auth_role'], $_SESSION['student_pk_id']) && $_SESSION['auth_role'] === 'student';
    }

    public function getTeacherSessionId()
    {
        $this->startSession();
        return $this->isTeacherLoggedIn() ? (int)$_SESSION['teacher_id'] : null;
    }

    public function getStudentSessionId()
    {
        $this->startSession();
        return $this->isStudentLoggedIn() ? (int)$_SESSION['student_pk_id'] : null;
    }

    public function logout()
    {
        $this->startSession();

        $_SESSION = array();

        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                '',
                time() - 42000,
                $params['path'],
                $params['domain'],
                $params['secure'],
                $params['httponly']
            );
        }

        session_destroy();

        return [
            'status' => 'success',
            'message' => 'Logged out successfully.'
        ];
    }
}
