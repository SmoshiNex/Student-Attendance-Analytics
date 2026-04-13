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
        ?int    $teacherId = null
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
            $mail->Body    = $this->buildEmailHtml($studentName, $status, $className, $checkInTime, $date);
            $mail->AltBody = $this->buildEmailText($studentName, $status, $className, $checkInTime, $date);

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
        $processValue = getenv($key);
        if ($processValue !== false && trim((string) $processValue) !== '') {
            return trim((string) $processValue);
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
                __DIR__ . '/../.env',
                __DIR__ . '/../../frontend/.env',
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
                'Missing mail configuration: ' . implode(', ', $missing) . '. Set them in backend/.env or frontend/.env.'
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
        string  $date
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

        $checkInRow = '';
        if ($checkInTime) {
            $checkInRow = "
            <tr>
                <td style=\"padding:10px 0;border-bottom:1px solid #e5e7eb;\">
                    <table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" width=\"100%\">
                        <tr>
                            <td style=\"font-weight:bold;color:#6b7280;font-size:14px;\">Check-in Time:</td>
                            <td align=\"right\" style=\"color:#111827;font-size:14px;\">" . htmlspecialchars($checkInTime) . "</td>
                        </tr>
                    </table>
                </td>
            </tr>";
        }

        $statusMessages = [
            'present' => '&#10003; Your child has successfully checked in on time for this class.',
            'late'    => '&#9888; Your child has checked in, but arrived after the designated time window.',
            'absent'  => '&#10007; Your child has not checked in for this class session.',
        ];
        $statusMsg = $statusMessages[$status] ?? '';

        return '<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Attendance Notification</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,\'Helvetica Neue\',Arial,sans-serif;background-color:#f4f4f4;line-height:1.6;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f4f4f4;">
<tr><td align="center" style="padding:20px 10px;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
    <tr>
        <td style="background-color:#1a1a1a;padding:30px 20px;text-align:center;border-radius:8px 8px 0 0;">
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:bold;">Smart Campus Attendance</h1>
            <p style="margin:8px 0 0 0;color:#ffffff;font-size:14px;opacity:0.9;">QR Attend System</p>
        </td>
    </tr>
    <tr>
        <td style="padding:30px 20px;">
            <p style="margin:0 0 20px 0;color:#333333;font-size:16px;">Dear Parent/Guardian,</p>
            <p style="margin:0 0 20px 0;color:#333333;font-size:15px;">
                This is to inform you that <strong style="color:#111827;">' . htmlspecialchars($studentName) . '</strong>
                <strong style="color:#111827;">' . $statusLabel . '</strong> for the following class:
            </p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f9fafb;border-radius:8px;border-left:4px solid #1a1a1a;margin:20px 0;">
                <tr><td style="padding:20px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                        <tr>
                            <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                    <tr>
                                        <td style="font-weight:bold;color:#6b7280;font-size:14px;">Student Name:</td>
                                        <td align="right" style="color:#111827;font-size:14px;">' . htmlspecialchars($studentName) . '</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                    <tr>
                                        <td style="font-weight:bold;color:#6b7280;font-size:14px;">Class:</td>
                                        <td align="right" style="color:#111827;font-size:14px;">' . htmlspecialchars($className) . '</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                    <tr>
                                        <td style="font-weight:bold;color:#6b7280;font-size:14px;">Date:</td>
                                        <td align="right" style="color:#111827;font-size:14px;">' . htmlspecialchars($date) . '</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        ' . $checkInRow . '
                        <tr>
                            <td style="padding:10px 0;">
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                    <tr>
                                        <td style="font-weight:bold;color:#6b7280;font-size:14px;">Status:</td>
                                        <td align="right">
                                            <span style="display:inline-block;padding:8px 16px;border-radius:20px;font-weight:bold;font-size:14px;background-color:' . $sc['bg'] . ';color:' . $sc['color'] . ';">' . $statusUpper . '</span>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </td></tr>
            </table>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f3f4f6;border-radius:6px;margin:20px 0;">
                <tr><td style="padding:15px;">
                    <p style="margin:0;color:#111827;font-size:14px;">' . $statusMsg . '</p>
                </td></tr>
            </table>
            <p style="margin:20px 0;color:#333333;font-size:15px;">If you have any questions or concerns, please contact the school administration.</p>
            <p style="margin:25px 0 0 0;color:#333333;font-size:14px;">Best regards,<br><strong style="color:#111827;">Smart Campus Attendance System</strong></p>
        </td>
    </tr>
    <tr>
        <td style="padding:20px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:0 0 10px 0;color:#6b7280;font-size:12px;">This is an automated notification. Please do not reply to this email.</p>
            <p style="margin:0;color:#6b7280;font-size:12px;">&copy; ' . date('Y') . ' Smart Campus Attendance - QR Attend System</p>
        </td>
    </tr>
</table>
</td></tr>
</table>
</body>
</html>';
    }

    private function buildEmailText(
        string  $studentName,
        string  $status,
        string  $className,
        ?string $checkInTime,
        string  $date
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
