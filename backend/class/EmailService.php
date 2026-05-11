<?php

/**
 * EmailService — sends parent attendance notifications via Brevo SMTP.
 * Mirrors the Laravel EmailService + AttendanceNotificationMail logic.
 *
 * Requires PHPMailer. Install with:
 *   composer require phpmailer/phpmailer
 * or drop the PHPMailer src/ folder next to this file and adjust the require paths.
 */

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

class EmailService
{
    // SMTP settings are loaded from environment variables/.env files.
    private string $host       = 'smtp-relay.brevo.com';
    private int    $port       = 587;
    private string $encryption = 'tls';
    private string $username   = '';
    private string $password   = '';
    private string $fromEmail  = '';
    private string $fromName   = 'Smart Campus Attendance';
    private static ?array $dotEnvCache = null;

    private $conn;

    public function __construct($db)
    {
        $this->conn = $db;
        $this->loadMailConfig();
    }

    /**
     * Send an attendance notification email to a parent/guardian.
     *
     * @param string      $parentEmail
     * @param string      $studentName
     * @param string      $status        present | late | absent
     * @param string      $className
     * @param string|null $checkInTime   formatted time string, null for absent
     * @param int         $studentId     PK of the student row
     * @param int|null    $teacherId
     */
    public function sendParentNotification(
        string  $parentEmail,
        string  $studentName,
        string  $status,
        string  $className,
        ?string $checkInTime,
        int     $studentId,
        ?int    $teacherId = null,
        string  $subjectName = ''
    ): array {
        $date = date('F d, Y');

        try {
            $this->requirePHPMailer();
            $this->assertMailConfig();

            $mail = new PHPMailer(true);
            $mail->isSMTP();
            $mail->Host       = $this->host;
            $mail->SMTPAuth   = true;
            $mail->Username   = $this->username;
            $mail->Password   = $this->password;
            $secureMode = strtolower($this->encryption);
            if ($secureMode === 'ssl') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
            } elseif ($secureMode === 'none' || $secureMode === '') {
                $mail->SMTPSecure = '';
            } else {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            }
            $mail->Port       = $this->port;

            $mail->setFrom($this->fromEmail, $this->fromName);
            $mail->addAddress($parentEmail);

            $statusMessages = [
                'present' => 'is present',
                'late'    => 'arrived late',
                'absent'  => 'is absent',
            ];
            $statusLabel = $statusMessages[$status] ?? 'has checked in';
            $mail->Subject = "Attendance Notification: {$studentName} - {$statusLabel}";

            $mail->isHTML(true);
            $mail->Body    = $this->buildEmailHtml($studentName, $status, $className, $checkInTime, $date, $subjectName);
            $mail->AltBody = $this->buildEmailText($studentName, $status, $className, $checkInTime, $date, $subjectName);

            $mail->send();

            // Log success for student
            $this->logNotification(
                'student',
                $studentId,
                'email_sent',
                'Email Sent to Parent',
                "Email notification sent to {$parentEmail} regarding {$studentName}'s attendance.",
                ['parent_email' => $parentEmail, 'student_name' => $studentName, 'status' => $status, 'class_name' => $className, 'check_in_time' => $checkInTime],
                'success'
            );

            // Log success for teacher
            if ($teacherId) {
                $this->logNotification(
                    'teacher',
                    $teacherId,
                    'email_sent',
                    'Email Sent to Parent',
                    "Email notification sent to {$parentEmail} for student {$studentName}.",
                    ['parent_email' => $parentEmail, 'student_name' => $studentName, 'status' => $status, 'class_name' => $className],
                    'success'
                );
            }

            return ['success' => true, 'message' => 'Email sent successfully'];

        } catch (\Exception $e) {
            error_log('EmailService error: ' . $e->getMessage());

            // Log failure for student
            $this->logNotification(
                'student',
                $studentId,
                'email_failed',
                'Email Notification Failed',
                "Error sending email to {$parentEmail}: " . $e->getMessage(),
                ['parent_email' => $parentEmail, 'student_name' => $studentName, 'status' => $status, 'class_name' => $className, 'error' => $e->getMessage()],
                'failed'
            );

            if ($teacherId) {
                $this->logNotification(
                    'teacher',
                    $teacherId,
                    'email_failed',
                    'Email Notification Failed',
                    "Error sending email to {$parentEmail} for student {$studentName}: " . $e->getMessage(),
                    ['parent_email' => $parentEmail, 'student_name' => $studentName, 'status' => $status, 'class_name' => $className, 'error' => $e->getMessage()],
                    'failed'
                );
            }

            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

        /**
         * Send a 6-digit OTP code for password reset verification.
         */
        public function sendPasswordResetOtp(
                string $recipientEmail,
                string $recipientName,
                string $otpCode,
                string $accountLabel = 'Account'
        ): array {
                $recipientEmail = trim($recipientEmail);
                $recipientName = trim($recipientName);
                $otpCode = trim($otpCode);
                $accountLabel = trim($accountLabel);

                if ($recipientEmail === '' || $otpCode === '') {
                        return ['success' => false, 'message' => 'Recipient email and OTP code are required.'];
                }

                try {
                        $this->requirePHPMailer();
                        $this->assertMailConfig();

                        $mail = new PHPMailer(true);
                        $mail->isSMTP();
                        $mail->Host       = $this->host;
                        $mail->SMTPAuth   = true;
                        $mail->Username   = $this->username;
                        $mail->Password   = $this->password;

                        $secureMode = strtolower($this->encryption);
                        if ($secureMode === 'ssl') {
                                $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
                        } elseif ($secureMode === 'none' || $secureMode === '') {
                                $mail->SMTPSecure = '';
                        } else {
                                $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
                        }

                        $mail->Port = $this->port;
                        $mail->setFrom($this->fromEmail, $this->fromName);
                        $mail->addAddress($recipientEmail, $recipientName !== '' ? $recipientName : '');

                        $label = $accountLabel !== '' ? $accountLabel : 'Account';
                        $safeName = $recipientName !== '' ? htmlspecialchars($recipientName, ENT_QUOTES, 'UTF-8') : 'User';
                        $safeCode = htmlspecialchars($otpCode, ENT_QUOTES, 'UTF-8');
                        $safeLabel = htmlspecialchars($label, ENT_QUOTES, 'UTF-8');

                        $isRegistration = stripos($label, 'registr') !== false;
                        $subjectContext = $isRegistration ? 'Account Verification' : 'Password Reset';
                        $bodyContext   = $isRegistration ? 'verify your email address and complete your registration' : 'reset your password';
                        $bodyHeading   = $isRegistration ? 'Email Verification OTP' : 'Password Reset OTP';

                        $mail->Subject = "{$subjectContext} OTP - Smart Campus Attendance";
                        $mail->isHTML(true);
                        ob_start();
                        include __DIR__ . '/email-templates/otp.php';
                        $mail->Body = ob_get_clean();

                        $mail->AltBody = "Smart Campus Attendance - {$subjectContext}\n"
                                . "Hello " . ($recipientName !== '' ? $recipientName : 'User') . ",\n\n"
                                . "Use this OTP code to {$bodyContext}: " . $otpCode . "\n"
                                . "This code expires in 10 minutes.\n\n"
                                . "If you did not request this, ignore this email.";

                        $mail->send();

                        return ['success' => true, 'message' => 'OTP sent successfully.'];
                } catch (\Exception $e) {
                        error_log('EmailService::sendPasswordResetOtp error: ' . $e->getMessage());
                        return ['success' => false, 'message' => $e->getMessage()];
                }
        }

    // ── Private helpers ─────────────────────────────────────────────────────

    private function loadMailConfig(): void
    {
        $this->host       = (string) $this->readEnvValue('MAIL_HOST', $this->host);
        $this->port       = (int) $this->readEnvValue('MAIL_PORT', (string) $this->port);
        $this->encryption = (string) $this->readEnvValue('MAIL_ENCRYPTION', $this->encryption);
        $this->username   = (string) $this->readEnvValue('MAIL_USERNAME', $this->username);
        $this->password   = (string) $this->readEnvValue('MAIL_PASSWORD', $this->password);
        $this->fromEmail  = (string) $this->readEnvValue('MAIL_FROM_ADDRESS', $this->fromEmail);
        $this->fromName   = (string) $this->readEnvValue('MAIL_FROM_NAME', $this->fromName);
    }

    private function readEnvValue(string $key, ?string $default = null): ?string
    {
        $value = getenv($key);
        if ($value !== false && trim((string) $value) !== '') {
            return trim((string) $value);
        }

        if (isset($_ENV[$key]) && trim((string) $_ENV[$key]) !== '') {
            return trim((string) $_ENV[$key]);
        }

        if (isset($_SERVER[$key]) && trim((string) $_SERVER[$key]) !== '') {
            return trim((string) $_SERVER[$key]);
        }

        $dotEnvValue = $this->getDotEnvValue($key);
        if ($dotEnvValue !== null && $dotEnvValue !== '') {
            return $dotEnvValue;
        }

        return $default;
    }

    private function getDotEnvValue(string $key): ?string
    {
        if (self::$dotEnvCache === null) {
            self::$dotEnvCache = [];

            $envPaths = [
                __DIR__ . '/../../.env',
            ];

            foreach ($envPaths as $envPath) {
                if (!is_file($envPath) || !is_readable($envPath)) {
                    continue;
                }

                $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                if ($lines === false) {
                    continue;
                }

                foreach ($lines as $line) {
                    $line = trim($line);
                    if ($line === '' || strpos($line, '#') === 0 || strpos($line, '=') === false) {
                        continue;
                    }

                    [$rawName, $rawValue] = explode('=', $line, 2);
                    $name = trim($rawName);
                    if (strpos($name, 'export ') === 0) {
                        $name = trim(substr($name, 7));
                    }

                    if ($name === '' || array_key_exists($name, self::$dotEnvCache)) {
                        continue;
                    }

                    $value = trim($rawValue);
                    if (strlen($value) >= 2) {
                        $first = $value[0];
                        $last  = $value[strlen($value) - 1];
                        if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                            $value = substr($value, 1, -1);
                        }
                    }

                    self::$dotEnvCache[$name] = $value;
                }
            }
        }

        return self::$dotEnvCache[$key] ?? null;
    }

    private function assertMailConfig(): void
    {
        $missing = [];
        if ($this->username === '') {
            $missing[] = 'MAIL_USERNAME';
        }
        if ($this->password === '') {
            $missing[] = 'MAIL_PASSWORD';
        }
        if ($this->fromEmail === '') {
            $missing[] = 'MAIL_FROM_ADDRESS';
        }

        if (!empty($missing)) {
            throw new \RuntimeException(
                'Missing mail configuration: ' . implode(', ', $missing) . '. Set them in the project root .env file.'
            );
        }
    }

    private function requirePHPMailer(): void
    {
        // Support both Composer autoload and a manual vendor drop-in.
        $composerAutoload = __DIR__ . '/../../vendor/autoload.php';
        $manualSrc        = __DIR__ . '/PHPMailer/src/PHPMailer.php';

        if (file_exists($composerAutoload)) {
            require_once $composerAutoload;
        } elseif (file_exists($manualSrc)) {
            require_once __DIR__ . '/PHPMailer/src/Exception.php';
            require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
            require_once __DIR__ . '/PHPMailer/src/SMTP.php';
        } else {
            throw new \RuntimeException(
                'PHPMailer not found. Run: composer require phpmailer/phpmailer'
            );
        }
    }

    private function logNotification(
        string  $userType,
        int     $userId,
        string  $type,
        string  $title,
        string  $message,
        array   $metadata = [],
        string  $status = 'success'
    ): void {
        try {
            $query = "INSERT INTO notification_logs
                        (user_type, user_id, type, title, message, metadata, status, read_at, created_at, updated_at)
                      VALUES
                        (:user_type, :user_id, :type, :title, :message, :metadata, :status, NULL, NOW(), NOW())";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([
                ':user_type' => $userType,
                ':user_id'   => $userId,
                ':type'      => $type,
                ':title'     => $title,
                ':message'   => $message,
                ':metadata'  => json_encode($metadata, JSON_UNESCAPED_SLASHES),
                ':status'    => $status,
            ]);
        } catch (\Exception $e) {
            error_log('EmailService::logNotification error: ' . $e->getMessage());
        }
    }

    private function buildEmailHtml(
        string  $studentName,
        string  $status,
        string  $className,
        ?string $checkInTime,
        string  $date,
        string  $subjectName = ''
    ): string {
        $statusLabels = ['present' => 'is present', 'late' => 'arrived late', 'absent' => 'is absent'];
        $statusLabel  = $statusLabels[$status] ?? 'has checked in';
        $statusUpper  = htmlspecialchars(strtoupper($status), ENT_QUOTES, 'UTF-8');

        $statusColors = [
            'present' => ['bg' => '#B9F8CF', 'color' => '#064e3b'],
            'late'    => ['bg' => '#FFF085', 'color' => '#854d0e'],
            'absent'  => ['bg' => '#FFC9C9', 'color' => '#991b1b'],
        ];
        $sc = $statusColors[$status] ?? ['bg' => '#e5e7eb', 'color' => '#111827'];

        $statusBg    = $sc['bg'];
        $statusColor = $sc['color'];
        $checkInTime = $checkInTime ?? '';

        $statusMessages = [
            'present' => '&#10003; Your child has successfully checked in on time for this class.',
            'late'    => '&#9888; Your child has checked in, but arrived after the designated time window.',
            'absent'  => '&#10007; Your child has not checked in for this class session.',
        ];
        $statusMsg = $statusMessages[$status] ?? '';
        $year      = (int) date('Y');

        ob_start();
        include __DIR__ . '/email-templates/attendance-notification.php';
        return ob_get_clean();
    }

    private function buildEmailText(
        string  $studentName,
        string  $status,
        string  $className,
        ?string $checkInTime,
        string  $date,
        string  $subjectName = ''
    ): string {
        $statusLabels = ['present' => 'is present', 'late' => 'arrived late', 'absent' => 'is absent'];
        $statusLabel  = $statusLabels[$status] ?? 'has checked in';

        $lines = [
            "Smart Campus Attendance - QR Attend System",
            "",
            "Dear Parent/Guardian,",
            "",
            "This is to inform you that {$studentName} {$statusLabel} for the following class:",
            "",
            "Student Name : {$studentName}",
            "Class        : {$className}",
            ($subjectName !== '' ? "Subject      : {$subjectName}" : ''),
            "Date         : {$date}",
        ];

        if ($checkInTime) {
            $lines[] = "Check-in Time: {$checkInTime}";
        }

        $lines[] = "Status       : " . strtoupper($status);
        $lines[] = "";
        $lines[] = "If you have any questions, please contact the school administration.";
        $lines[] = "";
        $lines[] = "Best regards,";
        $lines[] = "Smart Campus Attendance System";

        return implode("\n", $lines);
    }
}
