<?php
class Auth
{
    private $conn;
    private $studentTable = 'students';
    private $teacherTable = 'teachers';

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

    public function studentLogin($studentId, $password)
    {
        $studentId = trim((string)$studentId);
        $password = (string)$password;

        if ($studentId === '' || $password === '') {
            return [
                'status' => 'error',
                'message' => 'Student ID and password are required.'
            ];
        }

        $query = "SELECT id, student_id, first_name, last_name, email, parent_email, course, year_level, section, password
                  FROM {$this->studentTable}
                  WHERE student_id = :student_id
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([':student_id' => $studentId]);
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

        $query = "SELECT id, email, first_name, last_name, department, password
                  FROM {$this->teacherTable}
                  WHERE email = :email
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([':email' => $email]);
        $teacher = $stmt->fetch(PDO::FETCH_ASSOC);

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

    public function teacherRegister($firstName, $lastName, $email, $department, $password, $passwordConfirmation)
    {
        $firstName = trim((string)$firstName);
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

        if (strlen($password) < 8) {
            return [
                'status' => 'error',
                'message' => 'Password must be at least 8 characters.'
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

        $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

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

        return [
            'status' => 'success',
            'message' => 'Teacher account created successfully. You can now log in.'
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

        if (strlen($password) < 8) {
            return [
                'status' => 'error',
                'message' => 'Password must be at least 8 characters.'
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

        $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

        $updateQuery = "UPDATE {$this->teacherTable}
                        SET password = :password, updated_at = NOW()
                        WHERE id = :id";
        $updateStmt = $this->conn->prepare($updateQuery);
        $updateStmt->execute([
            ':password' => $hashedPassword,
            ':id' => $teacher['id']
        ]);

        return [
            'status' => 'success',
            'message' => 'Your password has been reset successfully.'
        ];
    }

    public function studentResetPassword($studentId, $parentEmail, $password, $passwordConfirmation)
    {
        $studentId = trim((string)$studentId);
        $parentEmail = trim((string)$parentEmail);
        $password = (string)$password;
        $passwordConfirmation = (string)$passwordConfirmation;

        if ($studentId === '' || $parentEmail === '' || $password === '' || $passwordConfirmation === '') {
            return [
                'status' => 'error',
                'message' => 'student_id, parent_email, password, and password confirmation are required.'
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

        if (strlen($password) < 8) {
            return [
                'status' => 'error',
                'message' => 'Password must be at least 8 characters.'
            ];
        }

        $query = "SELECT id, parent_email
                  FROM {$this->studentTable}
                  WHERE student_id = :student_id
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([':student_id' => $studentId]);
        $student = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$student) {
            return [
                'status' => 'error',
                'message' => 'This student ID is not registered in our system.'
            ];
        }

        $storedParentEmail = trim((string)($student['parent_email'] ?? ''));
        if ($storedParentEmail === '' || strcasecmp($storedParentEmail, $parentEmail) !== 0) {
            return [
                'status' => 'error',
                'message' => 'The parent email does not match our records.'
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

        $query = "SELECT id, email, first_name, last_name, department
                  FROM {$this->teacherTable}
                  WHERE id = :id
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([':id' => (int)$_SESSION['teacher_id']]);
        $teacher = $stmt->fetch(PDO::FETCH_ASSOC);

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
