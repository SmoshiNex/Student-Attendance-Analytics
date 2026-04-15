<?php
/**
 * Email template: OTP verification / password reset.
 *
 * Variables injected before include:
 *   string $safeName       — HTML-escaped recipient name
 *   string $safeCode       — HTML-escaped OTP code
 *   string $safeLabel      — HTML-escaped account label
 *   string $subjectContext — "Account Verification" | "Password Reset"
 *   string $bodyHeading    — "Email Verification OTP" | "Password Reset OTP"
 *   string $bodyContext    — purpose sentence fragment
 */
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $subjectContext ?></title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f3f4f6;">

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6;padding:24px 12px;">
        <tr>
            <td align="center">

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,0.08);">

                    <!-- Header -->
                    <tr>
                        <td style="background:#111827;padding:22px 24px;color:#ffffff;">
                            <h2 style="margin:0;font-size:20px;line-height:1.3;">Smart Campus Attendance</h2>
                            <p style="margin:6px 0 0 0;font-size:13px;opacity:0.9;"><?= $bodyHeading ?></p>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding:24px;">

                            <p style="margin:0 0 14px 0;color:#111827;font-size:15px;">Hello <?= $safeName ?>,</p>

                            <p style="margin:0 0 14px 0;color:#374151;font-size:14px;line-height:1.6;">
                                We received a request to <?= $bodyContext ?> for your
                                <strong><?= $safeLabel ?></strong>.
                                Use the OTP code below to continue:
                            </p>

                            <!-- OTP code box -->
                            <div style="margin:18px 0;padding:14px 16px;border:1px dashed #d1d5db;background:#f9fafb;border-radius:10px;text-align:center;">
                                <span style="display:inline-block;letter-spacing:8px;font-size:28px;font-weight:700;color:#111827;">
                                    <?= $safeCode ?>
                                </span>
                            </div>

                            <p style="margin:0 0 10px 0;color:#374151;font-size:14px;">This OTP expires in 10 minutes. Do not share this code with anyone.</p>

                            <p style="margin:0;color:#6b7280;font-size:13px;">If you did not request this, you can safely ignore this email.</p>

                        </td>
                    </tr>

                </table>

            </td>
        </tr>
    </table>

</body>
</html>
