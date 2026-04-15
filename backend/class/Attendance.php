<?php

class Attendance
{
    private $conn;
    private $sessionTable = 'attendance_sessions';
    private $recordTable = 'attendance_records';
    private $classTable = 'teacher_classes';
    private $studentTable = 'students';
    private $classStudentTable = 'class_student';
    private $notificationLogTable = 'notification_logs';

    public function __construct($db)
    {
        $this->conn = $db;
    }

    private function getClassName($sessionRow)
    {
        $className = trim((string)($sessionRow['class_name'] ?? ''));
        $classCode = trim((string)($sessionRow['class_code'] ?? ''));
        $subjectName = trim((string)($sessionRow['subject_name'] ?? ''));

        if ($className !== '') {
            return $className;
        }

        if ($classCode !== '' && $subjectName !== '') {
            return $classCode . ' - ' . $subjectName;
        }

        if ($subjectName !== '') {
            return $subjectName;
        }

        if ($classCode !== '') {
            return $classCode;
        }

        return 'Unknown Class';
    }

    private function getOwnedClass($teacherId, $classId)
    {
        // Fetch a single class that belongs to the given teacher — used to verify ownership before any session action
        $query = "SELECT id, teacher_id, class_code, class_name, subject_name, schedule, room
                  FROM {$this->classTable}
                  WHERE id = :class_id AND teacher_id = :teacher_id
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':class_id' => (int)$classId,
            ':teacher_id' => (int)$teacherId
        ]);

        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    private function getSessionForTeacher($sessionId, $teacherId)
    {
        // Fetch a session with its class info, only if the class belongs to the given teacher — prevents teachers from accessing other teachers' sessions
        $query = "SELECT s.id, s.teacher_class_id, s.duration_minutes,
                         DATE_FORMAT(s.started_at, '%Y-%m-%dT%H:%i:%s') AS started_at,
                         DATE_FORMAT(s.ends_at, '%Y-%m-%dT%H:%i:%s') AS ends_at,
                         DATE_FORMAT(s.ended_at, '%Y-%m-%dT%H:%i:%s') AS ended_at,
                         s.status, s.created_at, s.updated_at,
                         c.teacher_id, c.class_code, c.class_name, c.subject_name, c.schedule, c.room
                  FROM {$this->sessionTable} s
                  INNER JOIN {$this->classTable} c ON c.id = s.teacher_class_id
                  WHERE s.id = :session_id AND c.teacher_id = :teacher_id
                  LIMIT 1";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':session_id' => (int)$sessionId,
            ':teacher_id' => (int)$teacherId
        ]);

        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    private function getSessionById($sessionId)
    {
        // Fetch a session with its class info by session ID only — used during QR scan where teacher ownership is not required
        $query = "SELECT s.id, s.teacher_class_id, s.duration_minutes,
                         DATE_FORMAT(s.started_at, '%Y-%m-%dT%H:%i:%s') AS started_at,
                         DATE_FORMAT(s.ends_at, '%Y-%m-%dT%H:%i:%s') AS ends_at,
                         DATE_FORMAT(s.ended_at, '%Y-%m-%dT%H:%i:%s') AS ended_at,
                         s.status, s.created_at, s.updated_at,
                         c.teacher_id, c.class_code, c.class_name, c.subject_name, c.schedule, c.room
                  FROM {$this->sessionTable} s
                  INNER JOIN {$this->classTable} c ON c.id = s.teacher_class_id
                  WHERE s.id = :session_id
                  LIMIT 1";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([':session_id' => (int)$sessionId]);

        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    private function resolveSessionIdFromPayload($data)
    {
        $sessionId = (int)($data['session_id'] ?? 0);
        if ($sessionId > 0) {
            return $sessionId;
        }

        // Backward compatibility: allow qr_token with plain numeric or session:<id> values.
        $qrToken = trim((string)($data['qr_token'] ?? ''));
        if ($qrToken === '') {
            return 0;
        }

        if (ctype_digit($qrToken)) {
            return (int)$qrToken;
        }

        if (preg_match('/^session:(\d+)$/i', $qrToken, $matches)) {
            return (int)$matches[1];
        }

        return 0;
    }

    private function getStudentByExternalId($studentId)
    {
        // Look up a student by their school-issued student ID string (not the database primary key)
        $query = "SELECT id, student_id, first_name, last_name, parent_email
                  FROM {$this->studentTable}
                  WHERE student_id = :student_id
                  LIMIT 1";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([':student_id' => $studentId]);

        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    private function isStudentEnrolled($classId, $studentPkId)
    {
        // Check if a student is already enrolled in a class by looking for their record in the class_student pivot table
        $query = "SELECT id
                  FROM {$this->classStudentTable}
                  WHERE teacher_class_id = :class_id AND student_id = :student_id
                  LIMIT 1";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':class_id' => (int)$classId,
            ':student_id' => (int)$studentPkId
        ]);

        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    }

    private function ensureStudentEnrollment($classId, $studentPkId)
    {
        if ($this->isStudentEnrolled($classId, $studentPkId)) {
            return true;
        }

        $query = "INSERT INTO {$this->classStudentTable}
                    (teacher_class_id, student_id, created_at, updated_at)
                  VALUES
                    (:class_id, :student_id, NOW(), NOW())
                  ON DUPLICATE KEY UPDATE
                    updated_at = NOW()";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':class_id' => (int)$classId,
            ':student_id' => (int)$studentPkId,
        ]);

        return true;
    }

    private function getRecordBySessionAndStudent($sessionId, $studentPkId)
    {
        // Check if an attendance record already exists for this student in this session — used to prevent duplicate check-ins
        $query = "SELECT id, status, checked_in_at
                  FROM {$this->recordTable}
                  WHERE attendance_session_id = :session_id AND student_id = :student_id
                  LIMIT 1";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':session_id' => (int)$sessionId,
            ':student_id' => (int)$studentPkId
        ]);

        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    private function createNotificationLog($userType, $userId, $type, $title, $message, $metadata = null, $status = 'success')
    {
        $allowedUserTypes = ['teacher', 'student'];
        $allowedStatuses = ['success', 'failed', 'pending'];

        if (!in_array($userType, $allowedUserTypes, true) || (int)$userId <= 0) {
            return false;
        }

        if (!in_array($status, $allowedStatuses, true)) {
            $status = 'success';
        }

        $metadataJson = null;
        if (is_array($metadata)) {
            $metadataJson = json_encode($metadata, JSON_UNESCAPED_SLASHES);
        }

        // Insert a new notification log entry for either a teacher or student
        $query = "INSERT INTO {$this->notificationLogTable}
                    (user_type, user_id, type, title, message, metadata, status, read_at, created_at, updated_at)
                  VALUES
                    (:user_type, :user_id, :type, :title, :message, :metadata, :status, NULL, NOW(), NOW())";

        try {
            $stmt = $this->conn->prepare($query);
            $stmt->execute([
                ':user_type' => $userType,
                ':user_id' => (int)$userId,
                ':type' => trim((string)$type),
                ':title' => trim((string)$title),
                ':message' => trim((string)$message),
                ':metadata' => $metadataJson,
                ':status' => $status,
            ]);
            return true;
        } catch (Exception $e) {
            return false;
        }
    }

    private function createAttendanceNotifications($sessionData, $student, $status, $checkedInAt = null)
    {
        $className = $this->getClassName($sessionData);
        $subjectName = trim((string)($sessionData['subject_name'] ?? ''));
        $schedule = trim((string)($sessionData['schedule'] ?? ''));
        $studentName = trim((string)($student['first_name'] ?? '')) . ' ' . trim((string)($student['last_name'] ?? ''));
        $studentName = trim($studentName);
        $teacherId = (int)($sessionData['teacher_id'] ?? 0);
        $statusText = strtolower((string)$status);

        $metadata = [
            'class_name'    => $className,
            'subject_name'  => $subjectName !== '' ? $subjectName : null,
            'schedule'      => $schedule !== '' ? $schedule : null,
            'status'        => $statusText,
            'checked_in_at' => $checkedInAt,
            'student_name'  => $studentName,
            'student_id'    => $student['student_id'] ?? null,
        ];

        $created = 0;

        if ($this->createNotificationLog(
            'student',
            (int)$student['id'],
            'attendance',
            'Attendance Recorded',
            "You have been marked as {$statusText} for {$className}.",
            $metadata,
            'success'
        )) {
            $created++;
        }

        $teacherTitle   = $statusText === 'absent' ? 'Student Absent' : 'Student Checked In';
        $teacherMessage = $statusText === 'absent'
            ? "{$studentName} was marked as absent for {$className}."
            : "{$studentName} has checked in as {$statusText}.";

        if ($this->createNotificationLog(
            'teacher',
            $teacherId,
            'attendance',
            $teacherTitle,
            $teacherMessage,
            $metadata,
            'success'
        )) {
            $created++;
        }

        // Send actual email to parent and log the result.
        $parentEmail = trim((string)($student['parent_email'] ?? ''));
        if ($parentEmail !== '') {
            require_once __DIR__ . '/EmailService.php';
            $emailService = new EmailService($this->conn);

            $checkInTimeFormatted = $checkedInAt ? date('g:i A', strtotime($checkedInAt)) : null;

            $emailResult = $emailService->sendParentNotification(
                $parentEmail,
                $studentName,
                $statusText,
                $className,
                $checkInTimeFormatted,
                (int)$student['id'],
                $teacherId,
                $subjectName
            );

            // sendParentNotification already writes email_sent / email_failed logs internally.
            $created += 2; // student + teacher email log entries
        }

        return $created;
    }

    private function markAbsentForUnmarkedStudents($sessionData)
    {
        // Find all enrolled students who have no attendance record for this session — these are the ones to mark absent
        $query = "SELECT s.id, s.student_id, s.first_name, s.last_name, s.parent_email
                  FROM {$this->classStudentTable} cs
                  INNER JOIN {$this->studentTable} s ON s.id = cs.student_id
                  LEFT JOIN {$this->recordTable} ar
                    ON ar.attendance_session_id = :session_id
                   AND ar.student_id = s.id
                  WHERE cs.teacher_class_id = :class_id
                    AND ar.id IS NULL";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':session_id' => (int)$sessionData['id'],
            ':class_id' => (int)$sessionData['teacher_class_id'],
        ]);

        $unmarkedStudents = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if (!$unmarkedStudents) {
            return 0;
        }

        // Insert an absent record for each student who did not check in before the session was closed
        $insertQuery = "INSERT INTO {$this->recordTable}
                        (attendance_session_id, student_id, checked_in_at, status, created_at, updated_at)
                        VALUES
                        (:attendance_session_id, :student_id, NULL, 'absent', NOW(), NOW())";
        $insertStmt = $this->conn->prepare($insertQuery);

        $absentCount = 0;
        foreach ($unmarkedStudents as $student) {
            $insertStmt->execute([
                ':attendance_session_id' => (int)$sessionData['id'],
                ':student_id' => (int)$student['id'],
            ]);
            $this->createAttendanceNotifications($sessionData, $student, 'absent', null);
            $absentCount++;
        }

        return $absentCount;
    }

    public function createSession($teacherId, $data)
    {
        $classId = (int)($data['class_id'] ?? $data['teacher_class_id'] ?? 0);
        $durationMinutes = (int)($data['duration_minutes'] ?? 0);

        if ($classId <= 0 || $durationMinutes <= 0) {
            return [
                'status' => 'error',
                'message' => 'class_id and duration_minutes are required.'
            ];
        }

        if ($durationMinutes > 180) {
            return [
                'status' => 'error',
                'message' => 'duration_minutes must be between 1 and 180.'
            ];
        }

        $ownedClass = $this->getOwnedClass($teacherId, $classId);
        if (!$ownedClass) {
            return [
                'status' => 'error',
                'message' => 'Unauthorized or class not found.'
            ];
        }

        // End any currently active session for this class before starting a new one — a class can only have one active session at a time
        $endActiveQuery = "UPDATE {$this->sessionTable}
                           SET status = 'ended', ended_at = NOW(), updated_at = NOW()
                           WHERE teacher_class_id = :class_id AND status = 'active'";
        $endActiveStmt = $this->conn->prepare($endActiveQuery);
        $endActiveStmt->execute([':class_id' => $classId]);

        $startedAt = date('Y-m-d\TH:i:s');
        $endsAt = date('Y-m-d\TH:i:s', strtotime('+3 hours'));
        $serverTime = date('Y-m-d\TH:i:s');

        // Insert the new attendance session as active with the calculated start and end times
        $query = "INSERT INTO {$this->sessionTable}
                    (teacher_class_id, duration_minutes, started_at, ends_at, ended_at, status, created_at, updated_at)
                  VALUES
                    (:teacher_class_id, :duration_minutes, :started_at, :ends_at, NULL, 'active', NOW(), NOW())";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':teacher_class_id' => $classId,
            ':duration_minutes' => $durationMinutes,
            ':started_at' => $startedAt,
            ':ends_at' => $endsAt,
        ]);

        $sessionId = (int)$this->conn->lastInsertId();

        return [
            'status' => 'success',
            'message' => 'Attendance session created successfully.',
            'session_id' => $sessionId,
            'server_time' => $serverTime,
            'session' => [
                'id' => $sessionId,
                'teacher_class_id' => $classId,
                'duration_minutes' => $durationMinutes,
                'started_at' => $startedAt,
                'ends_at' => $endsAt,
                'status' => 'active',
            ],
            'qr_token' => 'session:' . $sessionId,
        ];
    }

    public function listSessionsByTeacher($teacherId, $classId = null)
    {
        $whereClass = '';
        $params = [':teacher_id' => (int)$teacherId];

        if ($classId !== null && (int)$classId > 0) {
            $whereClass = ' AND s.teacher_class_id = :class_id';
            $params[':class_id'] = (int)$classId;
        }

        // Fetch all sessions for this teacher with attendance counts per status — optionally filtered by a specific class
        $query = "SELECT s.id, s.teacher_class_id, s.duration_minutes, s.started_at, s.ends_at, s.ended_at, s.status,
                         s.created_at, s.updated_at,
                         c.teacher_id, c.class_code, c.class_name, c.subject_name,
                         COUNT(ar.id) AS total_records,
                         SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present_count,
                         SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) AS late_count,
                         SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) AS absent_count
                  FROM {$this->sessionTable} s
                  INNER JOIN {$this->classTable} c ON c.id = s.teacher_class_id
                  LEFT JOIN {$this->recordTable} ar ON ar.attendance_session_id = s.id
                  WHERE c.teacher_id = :teacher_id {$whereClass}
                  GROUP BY s.id, s.teacher_class_id, s.duration_minutes, s.started_at, s.ends_at, s.ended_at, s.status,
                           s.created_at, s.updated_at,
                           c.teacher_id, c.class_code, c.class_name, c.subject_name
                  ORDER BY s.id DESC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute($params);

        return [
            'status' => 'success',
            'sessions' => $stmt->fetchAll(PDO::FETCH_ASSOC)
        ];
    }

    public function getSessionRecords($sessionId, $teacherId)
    {
        $session = $this->getSessionForTeacher($sessionId, $teacherId);
        if (!$session) {
            return [
                'status' => 'error',
                'message' => 'Unauthorized or session not found.'
            ];
        }

        // Return ALL enrolled students with their attendance status
        // LEFT JOIN means students with no record yet still appear — their status shows as null until marked
        $query = "SELECT
                    s.id,
                    s.student_id,
                    CONCAT(s.first_name, ' ', s.last_name) AS student_name,
                    s.first_name, s.last_name, s.course, s.year_level, s.section,
                    ar.id AS record_id,
                    ar.status,
                    CASE
                        WHEN ar.checked_in_at IS NOT NULL
                        THEN DATE_FORMAT(ar.checked_in_at, '%h:%i:%s %p')
                        ELSE NULL
                    END AS checked_in_at,
                    CASE WHEN ar.id IS NOT NULL AND ar.checked_in_at IS NOT NULL THEN 1 ELSE 0 END AS has_checked_in
                  FROM {$this->classStudentTable} cs
                  INNER JOIN {$this->studentTable} s ON s.id = cs.student_id
                  LEFT JOIN {$this->recordTable} ar
                    ON ar.attendance_session_id = :session_id
                   AND ar.student_id = s.id
                  WHERE cs.teacher_class_id = :class_id
                  ORDER BY s.last_name ASC, s.first_name ASC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':session_id' => (int)$sessionId,
            ':class_id'   => (int)$session['teacher_class_id'],
        ]);

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $records = array_map(function ($row) {
            return [
                'id'            => (int)$row['id'],
                'student_id'    => $row['student_id'],
                'student_name'  => $row['student_name'],
                'first_name'    => $row['first_name'],
                'last_name'     => $row['last_name'],
                'checked_in_at' => $row['checked_in_at'],
                'status'        => $row['status'] ?? 'absent',
                'has_checked_in' => (bool)$row['has_checked_in'],
            ];
        }, $rows);

        return [
            'status'  => 'success',
            'session' => $session,
            'records' => $records,
        ];
    }

    public function getSessionSummary($sessionId, $teacherId)
    {
        $session = $this->getSessionForTeacher($sessionId, $teacherId);
        if (!$session) {
            return [
                'status' => 'error',
                'message' => 'Unauthorized or session not found.'
            ];
        }

        // Count total students enrolled in this class
        $enrolledQuery = "SELECT COUNT(*) AS total_enrolled
                          FROM {$this->classStudentTable}
                          WHERE teacher_class_id = :class_id";
        $enrolledStmt = $this->conn->prepare($enrolledQuery);
        $enrolledStmt->execute([':class_id' => (int)$session['teacher_class_id']]);
        $totalEnrolled = (int)$enrolledStmt->fetch(PDO::FETCH_ASSOC)['total_enrolled'];

        // Count present, late, and absent records for this session
        $statusQuery = "SELECT
                            SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_count,
                            SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late_count,
                            SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent_count
                        FROM {$this->recordTable}
                        WHERE attendance_session_id = :session_id";
        $statusStmt = $this->conn->prepare($statusQuery);
        $statusStmt->execute([':session_id' => (int)$sessionId]);
        $statusData = $statusStmt->fetch(PDO::FETCH_ASSOC);

        $present = (int)($statusData['present_count'] ?? 0);
        $late = (int)($statusData['late_count'] ?? 0);
        $absent = (int)($statusData['absent_count'] ?? 0);

        // Only add unmarked to absent when session has ended
        $counted = $present + $late + $absent;
        $unmarked = max($totalEnrolled - $counted, 0);
        if ((string)($session['status'] ?? '') === 'ended') {
            $absent += $unmarked;
        }

        return [
            'status' => 'success',
            'summary' => [
                'session_id' => (int)$sessionId,
                'teacher_class_id' => (int)$session['teacher_class_id'],
                // Keep legacy key for backward compatibility with old UI callers.
                'class_id' => (int)$session['teacher_class_id'],
                'total_enrolled' => $totalEnrolled,
                'present' => $present,
                'late' => $late,
                'absent' => $absent,
                'unmarked' => $unmarked,
            ]
        ];
    }

    public function getStudentHistory($studentPkId)
    {
        // ============================================================
        // STUDENT DASHBOARD — ATTENDANCE RATE CALCULATION
        // ============================================================
        // QUERY PURPOSE: Fetches all attendance records for this student
        //   across all classes. The frontend (Student Dashboard) uses
        //   this to compute the "Attendance Rate" metric card by dividing
        //   present+late records by total records × 100.
        //   Also powers the full Attendance History page.
        // ============================================================
        $historyQuery = "SELECT ar.id, ar.status, ar.checked_in_at,
                                DATE_FORMAT(COALESCE(ar.checked_in_at, ar.created_at), '%M %d, %Y %h:%i %p') AS checked_in_at_formatted,
                                COALESCE(
                                    NULLIF(c.class_name, ''),
                                    CASE
                                        WHEN c.class_code <> '' AND c.subject_name <> ''
                                            THEN CONCAT(c.class_code, ' - ', c.subject_name)
                                        WHEN c.subject_name <> '' THEN c.subject_name
                                        WHEN c.class_code  <> '' THEN c.class_code
                                        ELSE 'Unknown Class'
                                    END
                                ) AS class_name,
                                c.subject_name,
                                c.class_code,
                                CONCAT(t.first_name, ' ', t.last_name) AS teacher_name
                         FROM {$this->recordTable} ar
                         INNER JOIN {$this->sessionTable} s ON s.id = ar.attendance_session_id
                         INNER JOIN {$this->classTable} c ON c.id = s.teacher_class_id
                         INNER JOIN teachers t ON t.id = c.teacher_id
                         WHERE ar.student_id = :student_id
                         ORDER BY COALESCE(ar.checked_in_at, ar.created_at) DESC";

        $historyStmt = $this->conn->prepare($historyQuery);
        $historyStmt->execute([':student_id' => (int)$studentPkId]);

        return [
            'status' => 'success',
            'records' => $historyStmt->fetchAll(PDO::FETCH_ASSOC),
        ];
    }

    public function getTeacherReports($teacherId, $filters = [])
    {
        $params = [':teacher_id' => (int)$teacherId];
        $where = ["c.teacher_id = :teacher_id"];

        $classId = isset($filters['class_id']) ? (int)$filters['class_id'] : 0;
        if ($classId > 0) {
            $where[] = 'c.id = :class_id';
            $params[':class_id'] = $classId;
        }

        $date = trim((string)($filters['date'] ?? ''));
        if ($date !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            $where[] = 'DATE(COALESCE(ar.checked_in_at, ar.created_at)) = :report_date';
            $params[':report_date'] = $date;
        }

        $whereSql = 'WHERE ' . implode(' AND ', $where);

        // Fetch all attendance records across all sessions for this teacher's classes joined with student and class info — supports optional class and date filters
        $query = "SELECT ar.id, ar.status, ar.checked_in_at, ar.created_at,
                         s.id AS student_pk_id, s.student_id, s.first_name, s.last_name,
                         c.id AS class_id, c.class_code, c.class_name, c.subject_name
                  FROM {$this->recordTable} ar
                  INNER JOIN {$this->sessionTable} sess ON sess.id = ar.attendance_session_id
                  INNER JOIN {$this->classTable} c ON c.id = sess.teacher_class_id
                  INNER JOIN {$this->studentTable} s ON s.id = ar.student_id
                  {$whereSql}
                  ORDER BY COALESCE(ar.checked_in_at, ar.created_at) DESC, ar.id DESC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $records = [];
        foreach ($rows as $row) {
            $className = trim((string)($row['class_name'] ?? ''));
            $classCode = trim((string)($row['class_code'] ?? ''));
            $subjectName = trim((string)($row['subject_name'] ?? ''));

            if ($className === '') {
                if ($classCode !== '' && $subjectName !== '') {
                    $className = $classCode . ' - ' . $subjectName;
                } elseif ($subjectName !== '') {
                    $className = $subjectName;
                } elseif ($classCode !== '') {
                    $className = $classCode;
                } else {
                    $className = 'Unknown Class';
                }
            }

            $checkedInAt = $row['checked_in_at'] ?? null;
            $dateValue = $checkedInAt ?: ($row['created_at'] ?? null);

            $records[] = [
                'id' => (int)$row['id'],
                'status' => $row['status'],
                'checked_in_at' => $checkedInAt,
                'checked_in_time' => $checkedInAt ? date('h:i A', strtotime($checkedInAt)) : null,
                'date' => $dateValue,
                'class' => $className,
                'studentName' => trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? '')),
                'studentId' => $row['student_id'] ?? null,
                'student' => [
                    'id' => (int)$row['student_pk_id'],
                    'student_id' => $row['student_id'] ?? null,
                    'first_name' => $row['first_name'] ?? null,
                    'last_name' => $row['last_name'] ?? null,
                ],
                'session' => [
                    'teacherClass' => [
                        'id' => (int)$row['class_id'],
                        'class_code' => $row['class_code'] ?? null,
                        'class_name' => $row['class_name'] ?? null,
                        'subject_name' => $row['subject_name'] ?? null,
                    ],
                ],
            ];
        }

        // Fetch all classes belonging to this teacher for the filter dropdown in the reports page
        $classesQuery = "SELECT id, class_code, class_name, subject_name, schedule, room
                         FROM {$this->classTable}
                         WHERE teacher_id = :teacher_id
                         ORDER BY id DESC";
        $classesStmt = $this->conn->prepare($classesQuery);
        $classesStmt->execute([':teacher_id' => (int)$teacherId]);

        return [
            'status' => 'success',
            'records' => $records,
            'classes' => $classesStmt->fetchAll(PDO::FETCH_ASSOC),
        ];
    }

    public function getTeacherAnalytics($teacherId, $classId)
    {
        // Verify class belongs to teacher
        $ownedClass = $this->getOwnedClass($teacherId, $classId);
        if (!$ownedClass) {
            return ['status' => 'error', 'message' => 'Unauthorized or class not found.'];
        }

        // ============================================================
        // TEACHER ANALYTICS — OVERVIEW METRICS (Dashboard Stat Cards)
        // ============================================================
        // SQL FEATURE: CTE AT LEAST 1
        // SQL FEATURE: MULTIPLE JOINS (3 OR MORE TABLES IN 1 QUERY)
        // SQL FEATURE: AGGREGATION SQL (MORE THAN 2 OR 3, 4)
        //
        // QUERY PURPOSE: Powers the 7 stat cards on the Teacher Analytics page:
        //   - "Class Attendance Rate" (avg_attendance_rate)
        //   - "Sessions Held"         (total_sessions)
        //   - "Highest Session Rate"  (best_session_rate)
        //   - "Lowest Session Rate"   (worst_session_rate)
        //   - "Total Present"         (total_present)
        //   - "Total Late"            (total_late)
        //   - "Total Absent"          (total_absent)
        //
        // HOW IT WORKS:
        //   CTE `session_stats` — joins attendance_sessions → class_student → attendance_records
        //   to count present/late/absent per ended session, then the outer SELECT aggregates
        //   those per-session rows into class-wide AVG / MAX / MIN / SUM values.
        // ============================================================
        $overviewQuery = "
            WITH session_stats AS (
                SELECT
                    s.id AS session_id,
                    s.started_at,
                    COUNT(cs.student_id)                                          AS total_enrolled,
                    SUM(CASE WHEN ar.status IN ('present','late') THEN 1 ELSE 0 END) AS attended,
                    SUM(CASE WHEN ar.status = 'present'           THEN 1 ELSE 0 END) AS present_count,
                    SUM(CASE WHEN ar.status = 'late'              THEN 1 ELSE 0 END) AS late_count,
                    SUM(CASE WHEN ar.status = 'absent'            THEN 1 ELSE 0 END) AS absent_count
                FROM {$this->sessionTable} s
                INNER JOIN {$this->classStudentTable} cs ON cs.teacher_class_id = s.teacher_class_id
                LEFT JOIN {$this->recordTable} ar
                    ON ar.attendance_session_id = s.id AND ar.student_id = cs.student_id
                WHERE s.teacher_class_id = :class_id AND s.status = 'ended'
                GROUP BY s.id, s.started_at
            )
            SELECT
                COUNT(*)                                                        AS total_sessions,
                COALESCE(AVG(CASE WHEN total_enrolled > 0
                    THEN (attended / total_enrolled) * 100 ELSE 0 END), 0)     AS avg_attendance_rate,
                COALESCE(MAX(CASE WHEN total_enrolled > 0
                    THEN (attended / total_enrolled) * 100 ELSE 0 END), 0)     AS best_session_rate,
                COALESCE(MIN(CASE WHEN total_enrolled > 0
                    THEN (attended / total_enrolled) * 100 ELSE 0 END), 0)     AS worst_session_rate,
                COALESCE(SUM(present_count), 0)                                AS total_present,
                COALESCE(SUM(late_count), 0)                                   AS total_late,
                COALESCE(SUM(absent_count), 0)                                 AS total_absent
            FROM session_stats
        ";
        $overviewStmt = $this->conn->prepare($overviewQuery);
        $overviewStmt->execute([':class_id' => $classId]);
        $overview = $overviewStmt->fetch(PDO::FETCH_ASSOC);

        // Count the total number of students currently enrolled in this class
        $enrolledStmt = $this->conn->prepare(
            "SELECT COUNT(*) AS cnt FROM {$this->classStudentTable} WHERE teacher_class_id = :class_id"
        );
        $enrolledStmt->execute([':class_id' => $classId]);
        $totalEnrolled = (int)$enrolledStmt->fetch(PDO::FETCH_ASSOC)['cnt'];

        // ============================================================
        // TEACHER ANALYTICS — SESSION-BY-SESSION TREND (Bar+Line Chart)
        // ============================================================
        // QUERY PURPOSE: Feeds the "Session-by-Session Trend" ComposedChart
        //   (bars = Present/Late/Absent counts, line = Attendance Rate %).
        //   Each row = one ended session with its date label and counts.
        //
        // HOW IT WORKS:
        //   Joins attendance_sessions → class_student → attendance_records,
        //   groups by session, and computes per-session present/late/absent
        //   counts + total enrolled so the frontend can calculate the rate.
        // ============================================================
        $trendQuery = "
            SELECT
                s.id AS session_id,
                DATE_FORMAT(s.started_at, '%b %d') AS label,
                s.started_at,
                SUM(CASE WHEN ar.status IN ('present','late') THEN 1 ELSE 0 END) AS attended,
                SUM(CASE WHEN ar.status = 'present'           THEN 1 ELSE 0 END) AS present_count,
                SUM(CASE WHEN ar.status = 'late'              THEN 1 ELSE 0 END) AS late_count,
                SUM(CASE WHEN ar.status = 'absent'            THEN 1 ELSE 0 END) AS absent_count,
                COUNT(cs.student_id) AS total_enrolled
            FROM {$this->sessionTable} s
            INNER JOIN {$this->classStudentTable} cs ON cs.teacher_class_id = s.teacher_class_id
            LEFT JOIN {$this->recordTable} ar
                ON ar.attendance_session_id = s.id AND ar.student_id = cs.student_id
            WHERE s.teacher_class_id = :class_id AND s.status = 'ended'
            GROUP BY s.id, s.started_at
            ORDER BY s.started_at ASC
        ";
        $trendStmt = $this->conn->prepare($trendQuery);
        $trendStmt->execute([':class_id' => $classId]);
        $trendRows = $trendStmt->fetchAll(PDO::FETCH_ASSOC);

        $trend = array_map(function ($row) {
            $enrolled = (int)$row['total_enrolled'];
            $rate = $enrolled > 0 ? round(((int)$row['attended'] / $enrolled) * 100, 1) : 0;
            return [
                'session_id'      => (int)$row['session_id'],
                'label'           => $row['label'],
                'started_at'      => substr((string)$row['started_at'], 0, 10),
                'present'         => (int)$row['present_count'],
                'late'            => (int)$row['late_count'],
                'absent'          => (int)$row['absent_count'],
                'attendance_rate' => $rate,
            ];
        }, $trendRows);

        // ============================================================
        // TEACHER ANALYTICS — STUDENT ATTENDANCE SUMMARY TABLE
        // ============================================================
        // QUERY PURPOSE: Populates the "Student Attendance Summary" table
        //   showing each student's Present / Late / Absent counts and
        //   overall Attendance Rate %, plus the "At Risk" flag (rate < 75%).
        //
        // HOW IT WORKS:
        //   Uses three correlated subqueries — one per status — to count
        //   how many ended sessions each student was present, late, or absent
        //   in this class. Ordered alphabetically by last name.
        // ============================================================
        $studentQuery = "
            SELECT
                s.id,
                s.student_id,
                CONCAT(s.first_name, ' ', s.last_name) AS student_name,
                s.course, s.year_level, s.section,
                (
                    SELECT COUNT(*) FROM {$this->recordTable} ar2
                    INNER JOIN {$this->sessionTable} sess2 ON sess2.id = ar2.attendance_session_id
                    WHERE ar2.student_id = s.id
                      AND sess2.teacher_class_id = :class_id
                      AND sess2.status = 'ended'
                      AND ar2.status = 'present'
                ) AS present_count,
                (
                    SELECT COUNT(*) FROM {$this->recordTable} ar2
                    INNER JOIN {$this->sessionTable} sess2 ON sess2.id = ar2.attendance_session_id
                    WHERE ar2.student_id = s.id
                      AND sess2.teacher_class_id = :class_id2
                      AND sess2.status = 'ended'
                      AND ar2.status = 'late'
                ) AS late_count,
                (
                    SELECT COUNT(*) FROM {$this->recordTable} ar2
                    INNER JOIN {$this->sessionTable} sess2 ON sess2.id = ar2.attendance_session_id
                    WHERE ar2.student_id = s.id
                      AND sess2.teacher_class_id = :class_id3
                      AND sess2.status = 'ended'
                      AND ar2.status = 'absent'
                ) AS absent_count
            FROM {$this->classStudentTable} cs
            INNER JOIN {$this->studentTable} s ON s.id = cs.student_id
            WHERE cs.teacher_class_id = :class_id4
            ORDER BY s.last_name ASC, s.first_name ASC
        ";
        $studentStmt = $this->conn->prepare($studentQuery);
        $studentStmt->execute([
            ':class_id'  => $classId,
            ':class_id2' => $classId,
            ':class_id3' => $classId,
            ':class_id4' => $classId,
        ]);
        $studentRows = $studentStmt->fetchAll(PDO::FETCH_ASSOC);

        $totalSessions = (int)($overview['total_sessions'] ?? 0);
        $students = array_map(function ($row) use ($totalSessions) {
            $present = (int)$row['present_count'];
            $late    = (int)$row['late_count'];
            $absent  = (int)$row['absent_count'];
            $rate    = $totalSessions > 0 ? round((($present + $late) / $totalSessions) * 100, 1) : 0;
            return [
                'id'              => (int)$row['id'],
                'student_id'      => $row['student_id'],
                'student_name'    => $row['student_name'],
                'course'          => $row['course'],
                'year_level'      => $row['year_level'],
                'section'         => $row['section'],
                'present'         => $present,
                'late'            => $late,
                'absent'          => $absent,
                'attendance_rate' => $rate,
                'at_risk'         => $rate < 75,
            ];
        }, $studentRows);

        // ============================================================
        // TEACHER ANALYTICS — RAW RECORDS LOOKUP (Date Filter Support)
        // ============================================================
        // QUERY PURPOSE: Fetches every attendance record for this class so
        //   the frontend can re-compute student counts when the teacher
        //   applies a date/time filter without a new API call.
        //   Result is keyed as records_by_session[session_id][student_id].
        // ============================================================
        $recordsQuery = "
            SELECT ar.attendance_session_id, ar.student_id, ar.status,
                   DATE_FORMAT(ar.checked_in_at, '%h:%i %p') AS checked_in_at
            FROM {$this->recordTable} ar
            INNER JOIN {$this->sessionTable} s ON s.id = ar.attendance_session_id
            WHERE s.teacher_class_id = :class_id AND s.status = 'ended'
        ";
        $recordsStmt = $this->conn->prepare($recordsQuery);
        $recordsStmt->execute([':class_id' => $classId]);
        $recordRows = $recordsStmt->fetchAll(PDO::FETCH_ASSOC);

        $recordsBySession = [];
        foreach ($recordRows as $rec) {
            $sid = (int)$rec['attendance_session_id'];
            $stid = (int)$rec['student_id'];
            if (!isset($recordsBySession[$sid])) $recordsBySession[$sid] = [];
            $recordsBySession[$sid][$stid] = [
                'status'        => $rec['status'],
                'checked_in_at' => $rec['checked_in_at'],
            ];
        }

        return [
            'status' => 'success',
            'data' => [
                'class'    => [
                    'id'           => (int)$ownedClass['id'],
                    'class_code'   => $ownedClass['class_code'],
                    'class_name'   => $ownedClass['class_name'],
                    'subject_name' => $ownedClass['subject_name'],
                ],
                'overview' => [
                    'total_sessions'      => $totalSessions,
                    'total_enrolled'      => $totalEnrolled,
                    'avg_attendance_rate' => round((float)($overview['avg_attendance_rate'] ?? 0), 1),
                    'best_session_rate'   => round((float)($overview['best_session_rate'] ?? 0), 1),
                    'worst_session_rate'  => round((float)($overview['worst_session_rate'] ?? 0), 1),
                    'total_present'       => (int)($overview['total_present'] ?? 0),
                    'total_late'          => (int)($overview['total_late'] ?? 0),
                    'total_absent'        => (int)($overview['total_absent'] ?? 0),
                ],
                'trend'              => $trend,
                'students'           => $students,
                'records_by_session' => $recordsBySession,
            ],
        ];
    }

    public function getStudentAnalytics($studentPkId)
    {
        // ============================================================
        // STUDENT ANALYTICS — PER-CLASS STATS (Expandable Class Cards)
        // ============================================================
        // QUERY PURPOSE: Powers the "Attendance Per Class" expandable cards
        //   showing each class's Present / Late / Absent counts,
        //   Attendance Rate %, and the "At Risk" flag (rate < 75%).
        //   Also feeds the RadialBarChart (rate per class).
        //
        // HOW IT WORKS:
        //   CTE `class_totals` — joins class_student → teacher_classes →
        //   teachers → attendance_sessions → attendance_records to aggregate
        //   per-class stats for this student. The outer SELECT adds the
        //   at_risk flag using a CASE expression.
        // ============================================================
        $classStatsQuery = "
            WITH class_totals AS (
                SELECT
                    c.id AS class_id,
                    c.class_code,
                    c.class_name,
                    c.subject_name,
                    CONCAT(t.first_name, ' ', t.last_name) AS teacher_name,
                    COUNT(DISTINCT s.id)                                              AS total_sessions,
                    SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END)           AS present_count,
                    SUM(CASE WHEN ar.status = 'late'    THEN 1 ELSE 0 END)           AS late_count,
                    SUM(CASE WHEN ar.status = 'absent'  THEN 1 ELSE 0 END)           AS absent_count,
                    AVG(CASE WHEN ar.status IN ('present','late') THEN 1.0 ELSE 0 END) * 100 AS attendance_rate
                FROM {$this->classStudentTable} cs
                INNER JOIN {$this->classTable} c  ON c.id  = cs.teacher_class_id
                INNER JOIN teachers t              ON t.id  = c.teacher_id
                INNER JOIN {$this->sessionTable} s ON s.teacher_class_id = c.id AND s.status = 'ended'
                LEFT JOIN {$this->recordTable} ar
                    ON ar.attendance_session_id = s.id AND ar.student_id = cs.student_id
                WHERE cs.student_id = :student_id
                GROUP BY c.id, c.class_code, c.class_name, c.subject_name, t.first_name, t.last_name
            )
            SELECT *,
                CASE WHEN attendance_rate < 75 THEN 1 ELSE 0 END AS at_risk
            FROM class_totals
            ORDER BY attendance_rate ASC
        ";
        $classStmt = $this->conn->prepare($classStatsQuery);
        $classStmt->execute([':student_id' => $studentPkId]);
        $classRows = $classStmt->fetchAll(PDO::FETCH_ASSOC);

        // ============================================================
        // STUDENT ANALYTICS — OVERALL SUMMARY (Top Stat Cards)
        // ============================================================
        // QUERY PURPOSE: Powers the 4 summary stat cards at the top:
        //   - "My Overall Attendance Rate" (overall_rate)
        //   - "Enrolled Classes"           (total_classes — subquery)
        //   - "Times Present"              (total_present)
        //   - "Times Absent"               (total_absent)
        //   Also provides total_late and total_sessions_attended.
        //
        // HOW IT WORKS:
        //   Aggregates all attendance_records for this student across
        //   all ended sessions. A correlated subquery counts distinct
        //   enrolled classes (class_student table).
        // ============================================================
        $summaryQuery = "
            SELECT
                COUNT(DISTINCT ar.attendance_session_id)                          AS total_sessions_attended,
                SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END)           AS total_present,
                SUM(CASE WHEN ar.status = 'late'    THEN 1 ELSE 0 END)           AS total_late,
                SUM(CASE WHEN ar.status = 'absent'  THEN 1 ELSE 0 END)           AS total_absent,
                AVG(CASE WHEN ar.status IN ('present','late') THEN 1.0 ELSE 0 END) * 100 AS overall_rate,
                (
                    SELECT COUNT(DISTINCT cs2.teacher_class_id)
                    FROM {$this->classStudentTable} cs2
                    WHERE cs2.student_id = :student_id2
                ) AS total_classes
            FROM {$this->recordTable} ar
            INNER JOIN {$this->sessionTable} s ON s.id = ar.attendance_session_id AND s.status = 'ended'
            INNER JOIN {$this->classStudentTable} cs ON cs.teacher_class_id = s.teacher_class_id AND cs.student_id = ar.student_id
            WHERE ar.student_id = :student_id
        ";
        $summaryStmt = $this->conn->prepare($summaryQuery);
        $summaryStmt->execute([':student_id' => $studentPkId, ':student_id2' => $studentPkId]);
        $summary = $summaryStmt->fetch(PDO::FETCH_ASSOC);

        // ============================================================
        // STUDENT ANALYTICS — MONTHLY TREND (Bar+Line Chart)
        // ============================================================
        // QUERY PURPOSE: Feeds the "Monthly Attendance Trend" ComposedChart
        //   (bars = Attended/Missed counts, line = monthly Rate %).
        //   Each row = one calendar month with attended vs absent counts.
        //
        // HOW IT WORKS:
        //   Groups all attendance_records for this student by month using
        //   DATE_FORMAT, counting attended (present+late) vs absent per month.
        // ============================================================
        $monthlyQuery = "
            SELECT
                DATE_FORMAT(COALESCE(ar.checked_in_at, ar.created_at), '%b %Y') AS month_label,
                DATE_FORMAT(COALESCE(ar.checked_in_at, ar.created_at), '%Y-%m') AS month_sort,
                COUNT(*)                                                          AS total_records,
                SUM(CASE WHEN ar.status IN ('present','late') THEN 1 ELSE 0 END) AS attended,
                SUM(CASE WHEN ar.status = 'absent'            THEN 1 ELSE 0 END) AS absent
            FROM {$this->recordTable} ar
            INNER JOIN {$this->sessionTable} s ON s.id = ar.attendance_session_id AND s.status = 'ended'
            WHERE ar.student_id = :student_id
            GROUP BY month_label, month_sort
            ORDER BY month_sort ASC
        ";
        $monthlyStmt = $this->conn->prepare($monthlyQuery);
        $monthlyStmt->execute([':student_id' => $studentPkId]);
        $monthlyRows = $monthlyStmt->fetchAll(PDO::FETCH_ASSOC);

        // ============================================================
        // STUDENT ANALYTICS — SESSION TIMELINE (Session Log Table)
        // ============================================================
        // QUERY PURPOSE: Feeds the "Session Log" table inside each
        //   expanded class card, showing every ended session with the
        //   student's check-in time and status (Present/Late/Absent).
        //   Also used by ClassDetail to build the Session Breakdown chart.
        //
        // HOW IT WORKS:
        //   Joins class_student → teacher_classes → attendance_sessions
        //   → attendance_records (LEFT JOIN so missing records default to
        //   'absent'). Results are grouped by class_id in PHP for the
        //   timeline_by_class lookup the frontend uses.
        // ============================================================
        $sessionTimelineQuery = "
            SELECT
                c.id AS class_id,
                s.id AS session_id,
                DATE_FORMAT(s.started_at, '%b %d, %Y') AS session_label,
                s.started_at,
                COALESCE(ar.status, 'absent')                                     AS status,
                CASE WHEN ar.status IN ('present','late') THEN 1 ELSE 0 END       AS attended,
                CASE WHEN ar.checked_in_at IS NOT NULL
                     THEN DATE_FORMAT(ar.checked_in_at, '%h:%i %p')
                     ELSE NULL END                                                 AS checked_in_at
            FROM {$this->classStudentTable} cs
            INNER JOIN {$this->classTable} c  ON c.id = cs.teacher_class_id
            INNER JOIN {$this->sessionTable} s ON s.teacher_class_id = c.id AND s.status = 'ended'
            LEFT JOIN {$this->recordTable} ar
                ON ar.attendance_session_id = s.id AND ar.student_id = cs.student_id
            WHERE cs.student_id = :student_id
            ORDER BY c.id ASC, s.started_at ASC
        ";
        $timelineStmt = $this->conn->prepare($sessionTimelineQuery);
        $timelineStmt->execute([':student_id' => $studentPkId]);
        $timelineRows = $timelineStmt->fetchAll(PDO::FETCH_ASSOC);

        // Group timeline rows by class_id
        $timelineByClass = [];
        foreach ($timelineRows as $row) {
            $cid = (int)$row['class_id'];
            if (!isset($timelineByClass[$cid])) {
                $timelineByClass[$cid] = [];
            }
            $timelineByClass[$cid][] = [
                'session_id'    => (int)$row['session_id'],
                'label'         => $row['session_label'],
                'status'        => $row['status'],
                'attended'      => (bool)$row['attended'],
                'checked_in_at' => $row['checked_in_at'] ?? null,
            ];
        }

        $classes = array_map(function ($row) {
            $className = trim((string)($row['class_name'] ?? ''));
            if ($className === '') {
                $className = trim((string)($row['class_code'] ?? '')) ?: trim((string)($row['subject_name'] ?? '')) ?: 'Unknown';
            }
            return [
                'class_id'        => (int)$row['class_id'],
                'class_code'      => $row['class_code'],
                'class_name'      => $className,
                'subject_name'    => $row['subject_name'],
                'teacher_name'    => $row['teacher_name'],
                'total_sessions'  => (int)$row['total_sessions'],
                'present'         => (int)$row['present_count'],
                'late'            => (int)$row['late_count'],
                'absent'          => (int)$row['absent_count'],
                'attendance_rate' => round((float)($row['attendance_rate'] ?? 0), 1),
                'at_risk'         => (bool)$row['at_risk'],
            ];
        }, $classRows);

        $monthly = array_map(function ($row) {
            return [
                'label'   => $row['month_label'],
                'attended' => (int)$row['attended'],
                'absent'  => (int)$row['absent'],
            ];
        }, $monthlyRows);

        return [
            'status' => 'success',
            'data' => [
                'timeline_by_class' => $timelineByClass,
                'summary' => [
                    'total_classes'           => (int)($summary['total_classes'] ?? 0),
                    'total_sessions_attended' => (int)($summary['total_sessions_attended'] ?? 0),
                    'total_present'           => (int)($summary['total_present'] ?? 0),
                    'total_late'              => (int)($summary['total_late'] ?? 0),
                    'total_absent'            => (int)($summary['total_absent'] ?? 0),
                    'overall_rate'            => round((float)($summary['overall_rate'] ?? 0), 1),
                ],
                'classes' => $classes,
                'monthly' => $monthly,
            ],
        ];
    }


    public function getClassesWithTodayStats($teacherId)
    {
        $today = date('Y-m-d');

        // ============================================================
        // TEACHER DASHBOARD — CLASS LIST
        // ============================================================
        // QUERY PURPOSE: Fetches all classes for this teacher to build
        //   the dashboard class list (TodayClasses component).
        // ============================================================
        $classQuery = "SELECT id, class_code, class_name, subject_name, schedule, room
                       FROM {$this->classTable}
                       WHERE teacher_id = :teacher_id
                       ORDER BY id ASC";
        $classStmt = $this->conn->prepare($classQuery);
        $classStmt->execute([':teacher_id' => (int)$teacherId]);
        $classes = $classStmt->fetchAll(PDO::FETCH_ASSOC);

        $totalStudents = 0;
        $classesToday = 0;
        $presentToday = 0;
        $absentToday = 0;
        $formattedClasses = [];

        foreach ($classes as $class) {
            $classId = (int)$class['id'];

            // ============================================================
            // TEACHER DASHBOARD — ENROLLED STUDENT COUNT PER CLASS
            // ============================================================
            // QUERY PURPOSE: Powers the "Students Enrolled" stat card and
            //   the "total" field on each class card in TodayClasses.
            // ============================================================
            $enrolledStmt = $this->conn->prepare(
                "SELECT COUNT(*) AS cnt FROM {$this->classStudentTable} WHERE teacher_class_id = :cid"
            );
            $enrolledStmt->execute([':cid' => $classId]);
            $enrolled = (int)$enrolledStmt->fetch(PDO::FETCH_ASSOC)['cnt'];
            $totalStudents += $enrolled;

            // ============================================================
            // TEACHER DASHBOARD — TODAY'S SESSION LOOKUP
            // ============================================================
            // QUERY PURPOSE: Finds the most recent session started today
            //   for each class — determines whether to show "active",
            //   "ended", or "No session today" on each class card.
            // ============================================================
            $sessionStmt = $this->conn->prepare(
                "SELECT id, duration_minutes, started_at, status
                 FROM {$this->sessionTable}
                 WHERE teacher_class_id = :cid AND DATE(started_at) = :today
                 ORDER BY id DESC LIMIT 1"
            );
            $sessionStmt->execute([':cid' => $classId, ':today' => $today]);
            $session = $sessionStmt->fetch(PDO::FETCH_ASSOC);

            $timeDisplay = 'No session today';
            $status = null;
            $present = 0;
            $absent = 0;
            $activeSessionId = null;

            if ($session) {
                $classesToday++;
                $sessionId = (int)$session['id'];
                $endTime = date('g:i A', strtotime($session['started_at']) + ((int)$session['duration_minutes'] * 60));
                $timeDisplay = date('g:i A', strtotime($session['started_at'])) . ' - ' . $endTime;
                $status = $session['status'];

                // ============================================================
                // TEACHER DASHBOARD — LIVE ATTENDANCE COUNTS
                // ============================================================
                // QUERY PURPOSE: Powers the "Present Today" and "Absent Today"
                //   stat cards (StatsGrid) and the present/absent numbers
                //   shown on each class card in TodayClasses.
                // ============================================================
                $countsStmt = $this->conn->prepare(
                    "SELECT
                        SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) AS present_count,
                        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent_count
                     FROM {$this->recordTable}
                     WHERE attendance_session_id = :sid"
                );
                $countsStmt->execute([':sid' => $sessionId]);
                $counts = $countsStmt->fetch(PDO::FETCH_ASSOC);
                $present = (int)($counts['present_count'] ?? 0);
                $absent = (int)($counts['absent_count'] ?? 0);

                $presentToday += $present;
                if ($status === 'ended') {
                    $absentToday += $absent;
                }

                if ($status === 'active') {
                    $activeSessionId = $sessionId;
                }
            }

            $formattedClasses[] = [
                'id' => $classId,
                'code' => $class['class_code'],
                'name' => $class['subject_name'] ?: $class['class_name'],
                'time' => $timeDisplay,
                'status' => $status,
                'total' => $enrolled,
                'present' => $present,
                'absent' => $absent,
                'active_session_id' => $activeSessionId,
            ];
        }

        return [
            'classesToday' => $classesToday,
            'totalStudents' => $totalStudents,
            'presentToday' => $presentToday,
            'absentToday' => $absentToday,
            'classes' => $formattedClasses,
        ];
    }

    public function closeSession($sessionId, $teacherId)
    {
        $session = $this->getSessionForTeacher($sessionId, $teacherId);
        if (!$session) {
            return [
                'status' => 'error',
                'message' => 'Unauthorized or session not found.'
            ];
        }

        if ((string)$session['status'] === 'active') {
            // Mark the session as ended if it is still active
            $query = "UPDATE {$this->sessionTable}
                      SET status = 'ended', ended_at = NOW(), updated_at = NOW()
                      WHERE id = :id";

            $stmt = $this->conn->prepare($query);
            $stmt->execute([':id' => (int)$sessionId]);
        }

        $absentCount = $this->markAbsentForUnmarkedStudents($session);

        return [
            'status' => 'success',
            'message' => $absentCount > 0
                ? "Session ended successfully. {$absentCount} student(s) marked as absent."
                : 'Session ended successfully.',
            'absent_count' => $absentCount,
        ];
    }

    public function manualMark($sessionId, $teacherId, $data)
    {
        $session = $this->getSessionForTeacher($sessionId, $teacherId);
        if (!$session) {
            return [
                'status' => 'error',
                'message' => 'Unauthorized or session not found.'
            ];
        }

        $status = strtolower(trim((string)($data['status'] ?? 'present')));
        $allowedStatus = ['present', 'late', 'absent'];
        if (!in_array($status, $allowedStatus, true)) {
            return [
                'status' => 'error',
                'message' => 'Invalid status value. Allowed: present, late, absent.'
            ];
        }

        $studentPkId = 0;
        $student = null;
        if (isset($data['student_pk_id']) && (int)$data['student_pk_id'] > 0) {
            $studentPkId = (int)$data['student_pk_id'];
            // Fetch the student by their database primary key for manual marking
            $query = "SELECT id, student_id, first_name, last_name, parent_email
                      FROM {$this->studentTable}
                      WHERE id = :id
                      LIMIT 1";
            $stmt = $this->conn->prepare($query);
            $stmt->execute([':id' => $studentPkId]);
            $student = $stmt->fetch(PDO::FETCH_ASSOC);
        } elseif (!empty($data['student_id'])) {
            $student = $this->getStudentByExternalId((string)$data['student_id']);
            if ($student) {
                $studentPkId = (int)$student['id'];
            }
        }

        if ($studentPkId <= 0 || !$student) {
            return [
                'status' => 'error',
                'message' => 'student_pk_id or student_id is required.'
            ];
        }

        if (!$this->isStudentEnrolled((int)$session['teacher_class_id'], $studentPkId)) {
            return [
                'status' => 'error',
                'message' => 'Student is not enrolled in this class.'
            ];
        }

        $checkedInAt = $status === 'absent' ? null : date('Y-m-d H:i:s');
        $existingRecord = $this->getRecordBySessionAndStudent($sessionId, $studentPkId);

        if ($existingRecord) {
            // Update the existing attendance record with the new status and check-in time
            $updateQuery = "UPDATE {$this->recordTable}
                            SET status = :status, checked_in_at = :checked_in_at, updated_at = NOW()
                            WHERE id = :id";
            $updateStmt = $this->conn->prepare($updateQuery);
            $updateStmt->execute([
                ':status' => $status,
                ':checked_in_at' => $checkedInAt,
                ':id' => (int)$existingRecord['id']
            ]);
            $recordId = (int)$existingRecord['id'];
        } else {
            // Insert a new attendance record since none exists yet for this student in this session
            $insertQuery = "INSERT INTO {$this->recordTable}
                            (attendance_session_id, student_id, checked_in_at, status, created_at, updated_at)
                            VALUES
                            (:attendance_session_id, :student_id, :checked_in_at, :status, NOW(), NOW())";
            $insertStmt = $this->conn->prepare($insertQuery);
            $insertStmt->execute([
                ':attendance_session_id' => (int)$sessionId,
                ':student_id' => $studentPkId,
                ':checked_in_at' => $checkedInAt,
                ':status' => $status,
            ]);
            $recordId = (int)$this->conn->lastInsertId();
        }

        $notificationCount = $this->createAttendanceNotifications($session, $student, $status, $checkedInAt);

        return [
            'status' => 'success',
            'message' => 'Attendance status saved successfully.',
            'attendance_record_id' => $recordId,
            'notifications_created' => $notificationCount,
        ];
    }

    public function scanQr($data, $serverMeta = [])
    {
        $sessionId = $this->resolveSessionIdFromPayload($data);
        $studentExternalId = trim((string)($data['student_id'] ?? ''));

        if ($sessionId <= 0 || $studentExternalId === '') {
            return [
                'status'  => 'error',
                'message' => 'session_id and student_id are required.',
            ];
        }

        $session = $this->getSessionById($sessionId);
        if (!$session) {
            return [
                'status'        => 'error',
                'message'       => 'Attendance session not found.',
                'session_ended' => true,
            ];
        }

        // isActive: status must be 'active' AND now < ends_at (mirrors StarCoreTech isActive())
        $now = time();
        $endsAt = strtotime((string)$session['ends_at']);
        if ((string)$session['status'] !== 'active' || ($endsAt !== false && $now > $endsAt)) {
            return [
                'status'        => 'error',
                'message'       => 'This attendance session has ended.',
                'session_ended' => true,
            ];
        }

        $student = $this->getStudentByExternalId($studentExternalId);
        if (!$student) {
            return [
                'status'  => 'error',
                'message' => 'Student not found.',
            ];
        }

        $studentPkId = (int)$student['id'];
        $this->ensureStudentEnrollment((int)$session['teacher_class_id'], $studentPkId);

        $existingRecord = $this->getRecordBySessionAndStudent((int)$session['id'], $studentPkId);
        if ($existingRecord) {
            return [
                'status'               => 'error',
                'message'              => 'You have already checked in for this session.',
                'attendance_record_id' => (int)$existingRecord['id'],
                'already_marked'       => true,
                'student'              => $student,
                'class' => [
                    'class_code'   => $session['class_code'] ?? null,
                    'class_name'   => $session['class_name'] ?? null,
                    'subject_name' => $session['subject_name'] ?? null,
                ],
                'record' => [
                    'checked_in_at' => $existingRecord['checked_in_at']
                        ? date('g:i A', strtotime($existingRecord['checked_in_at']))
                        : 'N/A',
                    'status' => $existingRecord['status'],
                ],
            ];
        }

        // Determine present vs late
        // started_at + duration_minutes = present deadline
        $startedAt   = strtotime((string)$session['started_at']);
        $allowedTime = ($startedAt !== false) ? $startedAt + ((int)$session['duration_minutes'] * 60) : $now;
        $status      = $now <= $allowedTime ? 'present' : 'late';

        // Use client time if provided and sane (mirrors StarCoreTech X-Client-Time handling)
        $clientTimeStr = trim((string)($serverMeta['client_time'] ?? ''));
        $checkedInAt   = date('Y-m-d H:i:s');
        if ($clientTimeStr !== '') {
            $parsed = strtotime($clientTimeStr);
            if ($parsed !== false) {
                // Sanity check: reject if more than 1 hour in the future
                if ($parsed <= ($now + 3600)) {
                    $checkedInAt = date('Y-m-d H:i:s', $parsed);
                }
            }
        }

        // Insert the new attendance record for the student who just scanned the QR code
        $insertQuery = "INSERT INTO {$this->recordTable}
                        (attendance_session_id, student_id, checked_in_at, status, created_at, updated_at)
                        VALUES
                        (:attendance_session_id, :student_id, :checked_in_at, :status, NOW(), NOW())";
        $insertStmt = $this->conn->prepare($insertQuery);
        $insertStmt->execute([
            ':attendance_session_id' => (int)$session['id'],
            ':student_id'            => $studentPkId,
            ':checked_in_at'         => $checkedInAt,
            ':status'                => $status,
        ]);

        $recordId          = (int)$this->conn->lastInsertId();
        $notificationCount = $this->createAttendanceNotifications($session, $student, $status, $checkedInAt);

        return [
            'status'               => 'success',
            'message'              => $status === 'present' ? 'You are marked PRESENT.' : 'You checked in after the allowed time.',
            'attendance_record_id' => $recordId,
            'already_marked'       => false,
            'notifications_created' => $notificationCount,
            'student'              => $student,
            'class' => [
                'class_code'   => $session['class_code'] ?? null,
                'class_name'   => $session['class_name'] ?? null,
                'subject_name' => $session['subject_name'] ?? null,
            ],
            'record' => [
                'checked_in_at'           => $checkedInAt,
                'checked_in_at_formatted' => date('g:i:s A', strtotime($checkedInAt)),
                'status'                  => $status,
            ],
        ];
    }
}
