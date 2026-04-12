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
        $studentName = trim((string)($student['first_name'] ?? '')) . ' ' . trim((string)($student['last_name'] ?? ''));
        $studentName = trim($studentName);
        $teacherId = (int)($sessionData['teacher_id'] ?? 0);
        $statusText = strtolower((string)$status);

        $metadata = [
            'class_name'    => $className,
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
                $teacherId
            );

            // sendParentNotification already writes email_sent / email_failed logs internally.
            $created += 2; // student + teacher email log entries
        }

        return $created;
    }

    private function markAbsentForUnmarkedStudents($sessionData)
    {
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

        $endActiveQuery = "UPDATE {$this->sessionTable}
                           SET status = 'ended', ended_at = NOW(), updated_at = NOW()
                           WHERE teacher_class_id = :class_id AND status = 'active'";
        $endActiveStmt = $this->conn->prepare($endActiveQuery);
        $endActiveStmt->execute([':class_id' => $classId]);

        $startedAt = date('Y-m-d\TH:i:s');
        $endsAt = date('Y-m-d\TH:i:s', strtotime('+3 hours'));
        $serverTime = date('Y-m-d\TH:i:s');

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

        $records = array_map(function($row) {
            return [
                'id'            => (int)$row['id'],
                'student_id'    => $row['student_id'],
                'student_name'  => $row['student_name'],
                'first_name'    => $row['first_name'],
                'last_name'     => $row['last_name'],
                'checked_in_at' => $row['checked_in_at'],
                'status'        => $row['status'] ?? 'absent',
                'has_checked_in'=> (bool)$row['has_checked_in'],
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

        $enrolledQuery = "SELECT COUNT(*) AS total_enrolled
                          FROM {$this->classStudentTable}
                          WHERE teacher_class_id = :class_id";
        $enrolledStmt = $this->conn->prepare($enrolledQuery);
        $enrolledStmt->execute([':class_id' => (int)$session['teacher_class_id']]);
        $totalEnrolled = (int)$enrolledStmt->fetch(PDO::FETCH_ASSOC)['total_enrolled'];

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

    public function getClassesWithTodayStats($teacherId)
    {
        $today = date('Y-m-d');

        // Get all classes for this teacher
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

            // Count enrolled students
            $enrolledStmt = $this->conn->prepare(
                "SELECT COUNT(*) AS cnt FROM {$this->classStudentTable} WHERE teacher_class_id = :cid"
            );
            $enrolledStmt->execute([':cid' => $classId]);
            $enrolled = (int)$enrolledStmt->fetch(PDO::FETCH_ASSOC)['cnt'];
            $totalStudents += $enrolled;

            // Get today's session
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
            'notifications_created'=> $notificationCount,
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
