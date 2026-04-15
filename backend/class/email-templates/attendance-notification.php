<?php
/**
 * Email template: Parent attendance notification.
 *
 * Variables injected before include:
 *   string  $studentName
 *   string  $status        — present | late | absent
 *   string  $className
 *   string  $subjectName   — may be empty
 *   string  $checkInTime   — may be empty
 *   string  $date
 *   string  $statusLabel   — e.g. "is present"
 *   string  $statusUpper   — e.g. "PRESENT"
 *   string  $statusBg      — hex background for status badge
 *   string  $statusColor   — hex text color for status badge
 *   string  $statusMsg     — descriptive sentence about the status
 *   int     $year          — current year for footer
 */
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Attendance Notification</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f4f4f4;line-height:1.6;">

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f4f4f4;">
        <tr>
            <td align="center" style="padding:20px 10px;">

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">

                    <!-- Header -->
                    <tr>
                        <td style="background-color:#1a1a1a;padding:30px 20px;text-align:center;border-radius:8px 8px 0 0;">
                            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:bold;">Smart Campus Attendance</h1>
                            <p style="margin:8px 0 0 0;color:#ffffff;font-size:14px;opacity:0.9;">QR Attend System</p>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:30px 20px;">

                            <p style="margin:0 0 20px 0;color:#333333;font-size:16px;">Dear Parent/Guardian,</p>

                            <p style="margin:0 0 20px 0;color:#333333;font-size:15px;">
                                This is to inform you that
                                <strong style="color:#111827;"><?= htmlspecialchars($studentName) ?></strong>
                                <strong style="color:#111827;"><?= $statusLabel ?></strong>
                                for the following class:
                            </p>

                            <!-- Details card -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f9fafb;border-radius:8px;border-left:4px solid #1a1a1a;margin:20px 0;">
                                <tr>
                                    <td style="padding:20px;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">

                                            <!-- Student Name -->
                                            <tr>
                                                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">
                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                        <tr>
                                                            <td style="font-weight:bold;color:#6b7280;font-size:14px;">Student Name:</td>
                                                            <td align="right" style="color:#111827;font-size:14px;"><?= htmlspecialchars($studentName) ?></td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>

                                            <!-- Class -->
                                            <tr>
                                                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">
                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                        <tr>
                                                            <td style="font-weight:bold;color:#6b7280;font-size:14px;">Class:</td>
                                                            <td align="right" style="color:#111827;font-size:14px;"><?= htmlspecialchars($className) ?></td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>

                                            <?php if ($subjectName !== ''): ?>
                                            <!-- Subject -->
                                            <tr>
                                                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">
                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                        <tr>
                                                            <td style="font-weight:bold;color:#6b7280;font-size:14px;">Subject:</td>
                                                            <td align="right" style="color:#111827;font-size:14px;"><?= htmlspecialchars($subjectName) ?></td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                            <?php endif; ?>

                                            <!-- Date -->
                                            <tr>
                                                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">
                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                        <tr>
                                                            <td style="font-weight:bold;color:#6b7280;font-size:14px;">Date:</td>
                                                            <td align="right" style="color:#111827;font-size:14px;"><?= htmlspecialchars($date) ?></td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>

                                            <?php if ($checkInTime !== ''): ?>
                                            <!-- Check-in Time -->
                                            <tr>
                                                <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">
                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                        <tr>
                                                            <td style="font-weight:bold;color:#6b7280;font-size:14px;">Check-in Time:</td>
                                                            <td align="right" style="color:#111827;font-size:14px;"><?= htmlspecialchars($checkInTime) ?></td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                            <?php endif; ?>

                                            <!-- Status badge -->
                                            <tr>
                                                <td style="padding:10px 0;">
                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                        <tr>
                                                            <td style="font-weight:bold;color:#6b7280;font-size:14px;">Status:</td>
                                                            <td align="right">
                                                                <span style="display:inline-block;padding:8px 16px;border-radius:20px;font-weight:bold;font-size:14px;background-color:<?= $statusBg ?>;color:<?= $statusColor ?>;">
                                                                    <?= $statusUpper ?>
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>

                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Status message -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f3f4f6;border-radius:6px;margin:20px 0;">
                                <tr>
                                    <td style="padding:15px;">
                                        <p style="margin:0;color:#111827;font-size:14px;"><?= $statusMsg ?></p>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:20px 0;color:#333333;font-size:15px;">If you have any questions or concerns, please contact the school administration.</p>

                            <p style="margin:25px 0 0 0;color:#333333;font-size:14px;">
                                Best regards,<br>
                                <strong style="color:#111827;">Smart Campus Attendance System</strong>
                            </p>

                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding:20px;text-align:center;border-top:1px solid #e5e7eb;">
                            <p style="margin:0 0 10px 0;color:#6b7280;font-size:12px;">This is an automated notification. Please do not reply to this email.</p>
                            <p style="margin:0;color:#6b7280;font-size:12px;">&copy; <?= $year ?> Smart Campus Attendance - QR Attend System</p>
                        </td>
                    </tr>

                </table>

            </td>
        </tr>
    </table>

</body>
</html>
