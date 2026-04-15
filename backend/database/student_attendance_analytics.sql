-- Student Attendance Analytics (native PHP backend)
-- Regenerated to match current backend class/API contracts
-- and Laravel reference architecture for attendance + notifications.

CREATE DATABASE IF NOT EXISTS student_attendance_analytics
	CHARACTER SET utf8mb4
	COLLATE utf8mb4_unicode_ci;

USE student_attendance_analytics;

SET NAMES utf8mb4;

-- Rebuild tables in a safe FK order so schema stays consistent.
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS notification_logs;
DROP TABLE IF EXISTS attendance_records;
DROP TABLE IF EXISTS attendance_sessions;
DROP TABLE IF EXISTS class_student;
DROP TABLE IF EXISTS teacher_classes;
DROP TABLE IF EXISTS teachers;
DROP TABLE IF EXISTS students;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE students (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	student_id VARCHAR(255) NOT NULL,
	first_name VARCHAR(255) NOT NULL,
	last_name VARCHAR(255) NOT NULL,
	email VARCHAR(255) NOT NULL,
	parent_email VARCHAR(255) DEFAULT NULL,
	course VARCHAR(255) NOT NULL,
	year_level VARCHAR(255) NOT NULL,
	section VARCHAR(255) NOT NULL,
	-- Password is hashed by backend code (password_hash), never plain text.
	password VARCHAR(255) NOT NULL,
	remember_token VARCHAR(100) DEFAULT NULL,
	created_at DATETIME NULL,
	updated_at DATETIME NULL,
	PRIMARY KEY (id),
	UNIQUE KEY uq_students_student_id (student_id),
	UNIQUE KEY uq_students_email (email),
	KEY idx_students_parent_email (parent_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE teachers (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	email VARCHAR(255) NOT NULL,
	first_name VARCHAR(255) NOT NULL,
	middle_name VARCHAR(255) DEFAULT NULL,
	last_name VARCHAR(255) NOT NULL,
	department VARCHAR(255) NOT NULL,
	password VARCHAR(255) NOT NULL,
	remember_token VARCHAR(100) DEFAULT NULL,
	created_at DATETIME NULL,
	updated_at DATETIME NULL,
	PRIMARY KEY (id),
	UNIQUE KEY uq_teachers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE teacher_classes (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	teacher_id BIGINT UNSIGNED NOT NULL,
	class_code VARCHAR(255) NOT NULL,
	class_name VARCHAR(255) DEFAULT NULL,
	subject_name VARCHAR(255) NOT NULL,
	schedule VARCHAR(255) NOT NULL,
	room VARCHAR(255) DEFAULT NULL,
	enrollment_code VARCHAR(50) NOT NULL,
	created_at DATETIME NULL,
	updated_at DATETIME NULL,
	PRIMARY KEY (id),
	KEY idx_teacher_classes_teacher_id (teacher_id),
	CONSTRAINT fk_teacher_classes_teacher
		FOREIGN KEY (teacher_id)
		REFERENCES teachers (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE class_student (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	teacher_class_id BIGINT UNSIGNED NOT NULL,
	student_id BIGINT UNSIGNED NOT NULL,
	created_at DATETIME NULL,
	updated_at DATETIME NULL,
	PRIMARY KEY (id),
	UNIQUE KEY uq_class_student_pair (teacher_class_id, student_id),
	KEY idx_class_student_student_id (student_id),
	CONSTRAINT fk_class_student_teacher_class
		FOREIGN KEY (teacher_class_id)
		REFERENCES teacher_classes (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE,
	CONSTRAINT fk_class_student_student
		FOREIGN KEY (student_id)
		REFERENCES students (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attendance_sessions (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	teacher_class_id BIGINT UNSIGNED NOT NULL,
	duration_minutes INT UNSIGNED NOT NULL,
	started_at DATETIME NOT NULL,
	ends_at DATETIME NOT NULL,
	ended_at DATETIME DEFAULT NULL,
	status ENUM('active', 'ended') NOT NULL DEFAULT 'active',
	created_at DATETIME NULL,
	updated_at DATETIME NULL,
	PRIMARY KEY (id),
	KEY idx_attendance_sessions_teacher_class_id (teacher_class_id),
	KEY idx_attendance_sessions_status (status),
	KEY idx_attendance_sessions_started_at (started_at),
	CONSTRAINT fk_attendance_sessions_teacher_class
		FOREIGN KEY (teacher_class_id)
		REFERENCES teacher_classes (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attendance_records (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	attendance_session_id BIGINT UNSIGNED NOT NULL,
	student_id BIGINT UNSIGNED NOT NULL,
	checked_in_at DATETIME DEFAULT NULL,
	status ENUM('present', 'late', 'absent') NOT NULL DEFAULT 'present',
	created_at DATETIME NULL,
	updated_at DATETIME NULL,
	PRIMARY KEY (id),
	UNIQUE KEY uq_attendance_records_session_student (attendance_session_id, student_id),
	KEY idx_attendance_records_student_id (student_id),
	KEY idx_attendance_records_status (status),
	KEY idx_attendance_records_checked_in_at (checked_in_at),
	CONSTRAINT fk_attendance_records_session
		FOREIGN KEY (attendance_session_id)
		REFERENCES attendance_sessions (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE,
	CONSTRAINT fk_attendance_records_student
		FOREIGN KEY (student_id)
		REFERENCES students (id)
		ON DELETE CASCADE
		ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_logs (
	id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	user_type ENUM('teacher', 'student') NOT NULL,
	user_id BIGINT UNSIGNED NOT NULL,
	type VARCHAR(255) NOT NULL,
	title VARCHAR(255) NOT NULL,
	message TEXT NOT NULL,
	metadata JSON DEFAULT NULL,
	status ENUM('success', 'failed', 'pending') NOT NULL DEFAULT 'success',
	read_at DATETIME DEFAULT NULL,
	created_at DATETIME NULL,
	updated_at DATETIME NULL,
	PRIMARY KEY (id),
	KEY idx_notification_logs_user_type (user_type),
	KEY idx_notification_logs_user_id (user_id),
	KEY idx_notification_logs_type (type),
	KEY idx_notification_logs_status (status),
	KEY idx_notification_logs_user_created (user_type, user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

