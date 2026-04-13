<?php

/**
 * ParentContact — DEPRECATED
 *
 * The separate `parents` / `student_parent` table design was dropped to match
 * the Laravel reference architecture. Parent contact is now stored directly on
 * the `students.parent_email` column.
 *
 * Email notifications are handled by EmailService.
 * Notification history is stored in notification_logs.
 *
 * This file is kept as a stub so any stale require_once calls don't cause a
 * fatal error. Do not instantiate this class.
 */
class ParentContact
{
    public function __construct()
    {
        throw new \RuntimeException(
            'ParentContact is deprecated. Use students.parent_email and EmailService instead.'
        );
    }
}
