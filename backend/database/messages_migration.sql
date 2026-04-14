-- ============================================================
-- Migration: In-App Messaging
-- Run this once against student_attendance_analytics database
-- ============================================================

USE student_attendance_analytics;

-- sender/receiver_type: 'teacher' | 'student'
-- sender/receiver_id  : matches the PK in teachers / students table
-- message             : text body (empty string if attachment-only)
-- attachment_url      : public path to uploaded file (NULL if none)
-- attachment_type     : 'image' | 'pdf' | 'file' (NULL if none)
-- attachment_name     : original filename shown to the user (NULL if none)
CREATE TABLE messages (
    id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    sender_type     ENUM('teacher','student') NOT NULL,
    sender_id       BIGINT UNSIGNED  NOT NULL,
    receiver_type   ENUM('teacher','student') NOT NULL,
    receiver_id     BIGINT UNSIGNED  NOT NULL,
    class_id        BIGINT UNSIGNED  DEFAULT NULL,
    message         TEXT             NOT NULL DEFAULT '',
    attachment_url  VARCHAR(500)     DEFAULT NULL,
    attachment_type VARCHAR(50)      DEFAULT NULL,
    attachment_name VARCHAR(255)     DEFAULT NULL,
    is_read         TINYINT(1)       NOT NULL DEFAULT 0,
    created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_messages_sender   (sender_type,   sender_id),
    KEY idx_messages_receiver (receiver_type, receiver_id),
    KEY idx_messages_class    (class_id),
    KEY idx_messages_created  (created_at),
    CONSTRAINT fk_messages_class
        FOREIGN KEY (class_id) REFERENCES teacher_classes (id)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

