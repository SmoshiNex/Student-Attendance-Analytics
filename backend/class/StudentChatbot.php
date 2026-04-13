<?php

class StudentChatbot
{
    private $conn;
    private static $dotEnvCache = null;

    public function __construct($db)
    {
        $this->conn = $db;
    }

    public function chat($studentPkId, $message, $history = [])
    {
        $studentPkId = (int)$studentPkId;
        $message = trim((string)$message);

        if ($studentPkId <= 0) {
            return [
                'status' => 'error',
                'message' => 'Unauthorized.',
            ];
        }

        if ($message === '') {
            return [
                'status' => 'error',
                'message' => 'Message is required.',
            ];
        }

        if (!is_array($history)) {
            $history = [];
        }

        $studentContext = $this->getStudentContext($studentPkId);
        if ($studentContext === null) {
            return [
                'status' => 'error',
                'message' => 'Student session context not found.',
            ];
        }

        $studentAnalyticsContext = $this->buildStudentAnalyticsContext($studentPkId);

        $provider = strtolower(trim((string)$this->readEnvValue('CHATBOT_PROVIDER', 'auto')));
        if ($provider === '') {
            $provider = 'auto';
        }

        $errors = [];

        if ($provider === 'ollama' || $provider === 'auto') {
            $ollamaResult = $this->generateWithOllama($studentContext, $studentAnalyticsContext, $history, $message);
            if ($ollamaResult['status'] === 'success') {
                return [
                    'status' => 'success',
                    'reply' => $this->sanitizeAssistantReply((string)($ollamaResult['reply'] ?? '')),
                ];
            }

            $errors[] = 'Local AI: ' . (string)($ollamaResult['message'] ?? 'Ollama is unavailable.');

            if ($provider === 'ollama') {
                return [
                    'status' => 'success',
                    'reply' => $this->sanitizeAssistantReply($this->buildLimitedModeReply(
                        $studentPkId,
                        $message,
                        (string)($ollamaResult['message'] ?? 'Ollama is unavailable.')
                    )),
                ];
            }
        }

        if ($provider === 'gemini' || $provider === 'auto') {
            $geminiResult = $this->generateWithGemini($studentContext, $studentAnalyticsContext, $history, $message);
            if ($geminiResult['status'] === 'success') {
                return [
                    'status' => 'success',
                    'reply' => $this->sanitizeAssistantReply((string)($geminiResult['reply'] ?? '')),
                ];
            }

            $errors[] = 'Gemini: ' . (string)($geminiResult['message'] ?? 'Gemini is unavailable.');

            if ($provider === 'gemini') {
                return [
                    'status' => 'success',
                    'reply' => $this->sanitizeAssistantReply($this->buildLimitedModeReply(
                        $studentPkId,
                        $message,
                        (string)($geminiResult['message'] ?? 'Gemini is unavailable.')
                    )),
                ];
            }
        }

        $reason = !empty($errors) ? $errors[0] : 'No AI provider is currently available.';
        return [
            'status' => 'success',
            'reply' => $this->sanitizeAssistantReply($this->buildLimitedModeReply($studentPkId, $message, $reason)),
        ];
    }

    private function tryLocalReply($studentPkId, $message)
    {
        $normalized = strtolower(trim((string)$message));
        if ($normalized === '') {
            return null;
        }

        if (
            $this->containsAny($normalized, ['enrolled', 'my class', 'my classes', 'subjects']) ||
            ($this->containsAny($normalized, ['what', 'which', 'show', 'list']) && $this->containsAny($normalized, ['class', 'classes', 'subject', 'subjects']))
        ) {
            return $this->buildEnrolledClassesReply($studentPkId);
        }

        if ($this->containsAny($normalized, ['classmate', 'classmates', 'class roster', 'roster', 'students in my class', 'who is in my class'])) {
            return $this->buildClassmatesReply($studentPkId);
        }

        if ($this->containsAny($normalized, ['attendance rate', 'attendance', 'present', 'late', 'absent', 'analytics'])) {
            return $this->buildAttendanceSummaryReply($studentPkId);
        }

        if ($this->containsAny($normalized, ['notification', 'notifications', 'unread'])) {
            return $this->buildNotificationReply($studentPkId);
        }

        if ($this->containsAny($normalized, ['help', 'how to', 'what can you do'])) {
            return $this->buildPortalHelpReply();
        }

        return null;
    }

    private function buildEnrolledClassesReply($studentPkId)
    {
        $classes = $this->getEnrolledClasses($studentPkId);
        if (empty($classes)) {
            return 'I could not find any enrolled classes for your account yet. If you recently joined one, refresh the page and try again.';
        }

        $lines = [];
        foreach ($classes as $index => $classItem) {
            $title = trim((string)($classItem['class_code'] ?? ''));
            $subject = trim((string)($classItem['subject_name'] ?? ''));
            $className = trim((string)($classItem['class_name'] ?? ''));
            $schedule = trim((string)($classItem['schedule'] ?? ''));
            $room = trim((string)($classItem['room'] ?? ''));
            $teacher = trim((string)($classItem['teacher_name'] ?? ''));

            $label = $title;
            if ($subject !== '') {
                $label = $label !== '' ? ($label . ' - ' . $subject) : $subject;
            } elseif ($className !== '') {
                $label = $label !== '' ? ($label . ' - ' . $className) : $className;
            }

            if ($label === '') {
                $label = 'Class #' . ((int)$index + 1);
            }

            $meta = [];
            if ($schedule !== '') {
                $meta[] = 'Schedule: ' . $schedule;
            }
            if ($room !== '') {
                $meta[] = 'Room: ' . $room;
            }
            if ($teacher !== '') {
                $meta[] = 'Instructor: ' . $teacher;
            }

            $line = ((int)$index + 1) . '. ' . $label;
            if (!empty($meta)) {
                $line .= ' (' . implode(' | ', $meta) . ')';
            }

            $lines[] = $line;
        }

        return "You are enrolled in " . count($classes) . " class(es):\n" . implode("\n", $lines);
    }

    private function buildAttendanceSummaryReply($studentPkId)
    {
        $summary = $this->getAttendanceSummary($studentPkId);
        if ((int)$summary['total'] <= 0) {
            return 'You do not have attendance records yet. After your first successful check-in, I can summarize your rate and status breakdown.';
        }

        $attended = (int)$summary['present'] + (int)$summary['late'];
        $rate = (int)$summary['total'] > 0 ? round(($attended / (int)$summary['total']) * 100, 1) : 0;

        return "Attendance summary:\n"
            . '- Overall attendance rate: ' . $rate . "%\n"
            . '- Present: ' . (int)$summary['present'] . "\n"
            . '- Late: ' . (int)$summary['late'] . "\n"
            . '- Absent: ' . (int)$summary['absent'] . "\n"
            . '- Total recorded sessions: ' . (int)$summary['total'];
    }

    private function buildClassmatesReply($studentPkId)
    {
        $classes = $this->getEnrolledClasses($studentPkId);
        if (empty($classes)) {
            return 'You are not enrolled in any classes yet, so I could not find classmates to show.';
        }

        $classmatesByClass = $this->getClassmatesByClass($studentPkId);
        $lines = [];

        foreach ($classes as $index => $classItem) {
            $classId = (int)($classItem['id'] ?? 0);
            $label = $this->formatClassLabel(
                (string)($classItem['class_code'] ?? ''),
                (string)($classItem['subject_name'] ?? ''),
                (string)($classItem['class_name'] ?? '')
            );

            $classmates = $classId > 0 ? ($classmatesByClass[$classId] ?? []) : [];
            $prefix = ((int)$index + 1) . '. ' . $label . ' - ';

            if (empty($classmates)) {
                $lines[] = $prefix . 'no other classmates found yet.';
                continue;
            }

            $preview = array_slice($classmates, 0, 8);
            $names = [];
            foreach ($preview as $classmate) {
                $names[] = $this->formatStudentDisplayName($classmate);
            }

            $line = $prefix . implode(', ', $names);
            if (count($classmates) > count($preview)) {
                $line .= ', plus ' . (count($classmates) - count($preview)) . ' more';
            }

            $lines[] = $line;
        }

        return "Here are your classmates by class:\n" . implode("\n", $lines);
    }

    private function buildNotificationReply($studentPkId)
    {
        $unread = $this->getUnreadNotificationCount($studentPkId);
        if ($unread <= 0) {
            return 'You currently have no unread notifications. You can review all messages from the Notifications page in the sidebar.';
        }

        return 'You currently have ' . $unread . ' unread notification(s). Open Notifications in the sidebar to view details.';
    }

    private function buildPortalHelpReply()
    {
        return "I can help with:\n"
            . "- Showing your enrolled classes\n"
            . "- Listing your classmates by class\n"
            . "- Summarizing your attendance status\n"
            . "- Checking unread notifications\n"
            . "- Explaining portal steps (QR check-in, history, analytics)\n\n"
            . "Try asking: \"what classes am I enrolled in?\", \"who are my classmates?\", or \"what is my attendance rate?\"";
    }

    private function buildLimitedModeReply($studentPkId, $message, $reason)
    {
        $localReply = $this->tryLocalReply($studentPkId, $message);
        if ($localReply !== null) {
            return "I am currently in limited mode because " . trim($reason) . "\n\n" . $localReply;
        }

        return "I am currently in limited mode because " . trim($reason) . "\n\n"
            . "I can still help with:\n"
            . "- Your enrolled classes\n"
            . "- Your classmates by class\n"
            . "- Your attendance summary\n"
            . "- Your unread notifications\n\n"
            . "Try asking: \"what classes am I enrolled in?\"";
    }

    private function containsAny($text, $needles)
    {
        foreach ($needles as $needle) {
            if ($needle !== '' && strpos($text, $needle) !== false) {
                return true;
            }
        }

        return false;
    }

    private function getEnrolledClasses($studentPkId)
    {
        $query = "SELECT c.id, c.class_code, c.class_name, c.subject_name, c.schedule, c.room,
                         CONCAT(t.first_name, ' ', t.last_name) AS teacher_name
                  FROM class_student cs
                  INNER JOIN teacher_classes c ON c.id = cs.teacher_class_id
                  INNER JOIN teachers t ON t.id = c.teacher_id
                  WHERE cs.student_id = :student_id
                  ORDER BY c.class_code ASC, c.subject_name ASC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([':student_id' => (int)$studentPkId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return is_array($rows) ? $rows : [];
    }

    private function getAttendanceSummary($studentPkId)
    {
        $query = "SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_count,
                    SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late_count,
                    SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent_count
                  FROM attendance_records
                  WHERE student_id = :student_id";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([':student_id' => (int)$studentPkId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!is_array($row)) {
            return [
                'total' => 0,
                'present' => 0,
                'late' => 0,
                'absent' => 0,
            ];
        }

        return [
            'total' => (int)($row['total'] ?? 0),
            'present' => (int)($row['present_count'] ?? 0),
            'late' => (int)($row['late_count'] ?? 0),
            'absent' => (int)($row['absent_count'] ?? 0),
        ];
    }

    private function getUnreadNotificationCount($studentPkId)
    {
        $query = "SELECT COUNT(*) AS unread_count
                  FROM notification_logs
                  WHERE user_type = 'student' AND user_id = :user_id AND read_at IS NULL";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([':user_id' => (int)$studentPkId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return (int)($row['unread_count'] ?? 0);
    }

    private function buildStudentAnalyticsContext($studentPkId)
    {
        $classes = $this->getEnrolledClasses($studentPkId);
        $classmatesByClass = $this->getClassmatesByClass($studentPkId);
        $attendanceSummary = $this->getAttendanceSummary($studentPkId);
        $attendanceByClass = $this->getAttendanceSummaryByClass($studentPkId);
        $recentRecords = $this->getRecentAttendanceRecords($studentPkId);
        $unreadNotifications = $this->getUnreadNotificationCount($studentPkId);

        $lines = [
            'Live student analytics context (authoritative; do not fabricate values):',
            '- Unread notifications: ' . $unreadNotifications,
        ];

        $totalClasses = count($classes);
        $classRows = array_slice($classes, 0, 12);

        if ($totalClasses <= 0) {
            $lines[] = '- Enrolled classes: none found.';
        } else {
            $lines[] = '- Enrolled classes (' . $totalClasses . ' total):';

            foreach ($classRows as $classItem) {
                $label = $this->formatClassLabel(
                    (string)($classItem['class_code'] ?? ''),
                    (string)($classItem['subject_name'] ?? ''),
                    (string)($classItem['class_name'] ?? '')
                );

                $meta = [];
                $schedule = trim((string)($classItem['schedule'] ?? ''));
                $room = trim((string)($classItem['room'] ?? ''));
                $teacher = trim((string)($classItem['teacher_name'] ?? ''));

                if ($schedule !== '') {
                    $meta[] = 'Schedule: ' . $schedule;
                }
                if ($room !== '') {
                    $meta[] = 'Room: ' . $room;
                }
                if ($teacher !== '') {
                    $meta[] = 'Instructor: ' . $teacher;
                }

                $line = '  - ' . $label;
                if (!empty($meta)) {
                    $line .= ' (' . implode(' | ', $meta) . ')';
                }

                $lines[] = $line;
            }

            if ($totalClasses > count($classRows)) {
                $lines[] = '  - ... plus ' . ($totalClasses - count($classRows)) . ' more class(es).';
            }
        }

        $lines[] = '- Classmates by class:';
        if ($totalClasses <= 0) {
            $lines[] = '  - No enrolled classes, so no classmates are listed.';
        } else {
            foreach ($classRows as $classItem) {
                $classId = (int)($classItem['id'] ?? 0);
                $label = $this->formatClassLabel(
                    (string)($classItem['class_code'] ?? ''),
                    (string)($classItem['subject_name'] ?? ''),
                    (string)($classItem['class_name'] ?? '')
                );

                $classmates = $classId > 0 ? ($classmatesByClass[$classId] ?? []) : [];
                if (empty($classmates)) {
                    $lines[] = '  - ' . $label . ': no other classmates found.';
                    continue;
                }

                $preview = array_slice($classmates, 0, 8);
                $names = [];
                foreach ($preview as $classmate) {
                    $names[] = $this->formatStudentDisplayName($classmate);
                }

                $line = '  - ' . $label . ' (' . count($classmates) . ' classmate(s)): ' . implode(', ', $names);
                if (count($classmates) > count($preview)) {
                    $line .= ', plus ' . (count($classmates) - count($preview)) . ' more';
                }

                $lines[] = $line;
            }
        }

        $present = (int)($attendanceSummary['present'] ?? 0);
        $late = (int)($attendanceSummary['late'] ?? 0);
        $absent = (int)($attendanceSummary['absent'] ?? 0);
        $total = (int)($attendanceSummary['total'] ?? 0);
        $overallRate = $total > 0 ? round((($present + $late) / $total) * 100, 1) : 0;

        $lines[] = '- Attendance performance overview:';
        if ($total <= 0) {
            $lines[] = '  - No attendance records yet.';
        } else {
            $lines[] = '  - Overall attendance rate: ' . $overallRate . '%';
            $lines[] = '  - Present: ' . $present . ', Late: ' . $late . ', Absent: ' . $absent . ', Total: ' . $total;
        }

        $byClassRows = array_slice($attendanceByClass, 0, 12);
        $lines[] = '- Attendance analytics by class:';
        if (empty($byClassRows)) {
            $lines[] = '  - No class-level attendance analytics yet.';
        } else {
            foreach ($byClassRows as $row) {
                $classTotal = (int)($row['total'] ?? 0);
                $classPresent = (int)($row['present'] ?? 0);
                $classLate = (int)($row['late'] ?? 0);
                $classAbsent = (int)($row['absent'] ?? 0);
                $classRate = $classTotal > 0 ? round((($classPresent + $classLate) / $classTotal) * 100, 1) : 0;

                $label = $this->formatClassLabel(
                    (string)($row['class_code'] ?? ''),
                    (string)($row['subject_name'] ?? ''),
                    (string)($row['class_name'] ?? '')
                );

                $lines[] = '  - ' . $label
                    . ' => rate: ' . $classRate . '%'
                    . ', present: ' . $classPresent
                    . ', late: ' . $classLate
                    . ', absent: ' . $classAbsent
                    . ', total: ' . $classTotal;
            }

            if (count($attendanceByClass) > count($byClassRows)) {
                $lines[] = '  - ... plus ' . (count($attendanceByClass) - count($byClassRows)) . ' more class analytics row(s).';
            }
        }

        $recentRows = array_slice($recentRecords, 0, 8);
        $lines[] = '- Recent attendance timeline:';
        if (empty($recentRows)) {
            $lines[] = '  - No recent attendance entries.';
        } else {
            foreach ($recentRows as $row) {
                $label = $this->formatClassLabel(
                    (string)($row['class_code'] ?? ''),
                    (string)($row['subject_name'] ?? ''),
                    (string)($row['class_name'] ?? '')
                );

                $status = trim((string)($row['status'] ?? 'unknown'));
                $time = trim((string)($row['checked_in_at'] ?? ''));
                if ($time === '') {
                    $time = trim((string)($row['started_at'] ?? ''));
                }
                if ($time === '') {
                    $time = 'N/A';
                }

                $lines[] = '  - ' . $time . ' | ' . $label . ' | status: ' . $status;
            }
        }

        return implode("\n", $lines);
    }

    private function getAttendanceSummaryByClass($studentPkId)
    {
        $query = "SELECT
                    c.class_code,
                    c.subject_name,
                    c.class_name,
                    COUNT(ar.id) AS total,
                    SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present_count,
                    SUM(CASE WHEN ar.status = 'late' THEN 1 ELSE 0 END) AS late_count,
                    SUM(CASE WHEN ar.status = 'absent' THEN 1 ELSE 0 END) AS absent_count
                  FROM class_student cs
                  INNER JOIN teacher_classes c ON c.id = cs.teacher_class_id
                  LEFT JOIN attendance_sessions s ON s.teacher_class_id = c.id
                  LEFT JOIN attendance_records ar
                    ON ar.attendance_session_id = s.id
                   AND ar.student_id = cs.student_id
                  WHERE cs.student_id = :student_id
                  GROUP BY c.id, c.class_code, c.subject_name, c.class_name
                  ORDER BY c.class_code ASC, c.subject_name ASC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([':student_id' => (int)$studentPkId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (!is_array($rows)) {
            return [];
        }

        $result = [];
        foreach ($rows as $row) {
            $result[] = [
                'class_code' => (string)($row['class_code'] ?? ''),
                'subject_name' => (string)($row['subject_name'] ?? ''),
                'class_name' => (string)($row['class_name'] ?? ''),
                'total' => (int)($row['total'] ?? 0),
                'present' => (int)($row['present_count'] ?? 0),
                'late' => (int)($row['late_count'] ?? 0),
                'absent' => (int)($row['absent_count'] ?? 0),
            ];
        }

        return $result;
    }

    private function getClassmatesByClass($studentPkId)
    {
        $query = "SELECT
                    cs_me.teacher_class_id AS class_id,
                    s.student_id,
                    s.first_name,
                    s.last_name,
                    s.course,
                    s.year_level,
                    s.section
                  FROM class_student cs_me
                  INNER JOIN class_student cs_peer ON cs_peer.teacher_class_id = cs_me.teacher_class_id
                  INNER JOIN students s ON s.id = cs_peer.student_id
                  WHERE cs_me.student_id = :student_id
                    AND cs_peer.student_id <> :student_id
                  ORDER BY cs_me.teacher_class_id ASC, s.last_name ASC, s.first_name ASC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([':student_id' => (int)$studentPkId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (!is_array($rows)) {
            return [];
        }

        $grouped = [];
        foreach ($rows as $row) {
            $classId = (int)($row['class_id'] ?? 0);
            if ($classId <= 0) {
                continue;
            }

            if (!isset($grouped[$classId])) {
                $grouped[$classId] = [];
            }

            $grouped[$classId][] = [
                'student_id' => (string)($row['student_id'] ?? ''),
                'first_name' => (string)($row['first_name'] ?? ''),
                'last_name' => (string)($row['last_name'] ?? ''),
                'course' => (string)($row['course'] ?? ''),
                'year_level' => (string)($row['year_level'] ?? ''),
                'section' => (string)($row['section'] ?? ''),
            ];
        }

        return $grouped;
    }

    private function formatStudentDisplayName($student)
    {
        $first = trim((string)($student['first_name'] ?? ''));
        $last = trim((string)($student['last_name'] ?? ''));
        $studentId = trim((string)($student['student_id'] ?? ''));

        $name = trim($first . ' ' . $last);
        if ($name !== '') {
            return $name;
        }

        if ($studentId !== '') {
            return $studentId;
        }

        return 'Unnamed student';
    }

    private function getRecentAttendanceRecords($studentPkId)
    {
        $query = "SELECT
                    ar.status,
                    ar.checked_in_at,
                    s.started_at,
                    c.class_code,
                    c.subject_name,
                    c.class_name
                  FROM attendance_records ar
                  INNER JOIN attendance_sessions s ON s.id = ar.attendance_session_id
                  INNER JOIN teacher_classes c ON c.id = s.teacher_class_id
                  WHERE ar.student_id = :student_id
                  ORDER BY COALESCE(ar.checked_in_at, s.started_at) DESC
                  LIMIT 8";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([':student_id' => (int)$studentPkId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return is_array($rows) ? $rows : [];
    }

    private function formatClassLabel($classCode, $subjectName, $className)
    {
        $code = trim((string)$classCode);
        $subject = trim((string)$subjectName);
        $name = trim((string)$className);

        if ($code !== '' && $subject !== '') {
            return $code . ' - ' . $subject;
        }

        if ($subject !== '') {
            return $subject;
        }

        if ($code !== '') {
            return $code;
        }

        if ($name !== '') {
            return $name;
        }

        return 'Unnamed class';
    }

    private function generateWithOllama($studentContext, $studentAnalyticsContext, $history, $message)
    {
        if (!function_exists('curl_init')) {
            return [
                'status' => 'error',
                'message' => 'cURL is not enabled on the server.',
            ];
        }

        $baseUrl = rtrim((string)$this->readEnvValue('OLLAMA_BASE_URL', 'http://127.0.0.1:11434'), '/');
        $model = trim((string)$this->readEnvValue('OLLAMA_MODEL', 'llama3.2:3b'));
        if ($model === '') {
            $model = 'llama3.2:3b';
        }

        $messages = [
            [
                'role' => 'system',
                'content' => $this->buildSystemInstruction($studentContext, $studentAnalyticsContext),
            ],
        ];

        $history = array_slice((array)$history, -10);
        foreach ($history as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $role = strtolower(trim((string)($entry['role'] ?? '')));
            $text = trim((string)($entry['content'] ?? ''));
            if ($text === '' || !in_array($role, ['user', 'assistant'], true)) {
                continue;
            }

            if (strlen($text) > 1200) {
                $text = substr($text, 0, 1200);
            }

            $messages[] = [
                'role' => $role === 'assistant' ? 'assistant' : 'user',
                'content' => $text,
            ];
        }

        if (strlen($message) > 2000) {
            $message = substr($message, 0, 2000);
        }

        $messages[] = [
            'role' => 'user',
            'content' => $message,
        ];

        $payload = [
            'model' => $model,
            'messages' => $messages,
            'stream' => false,
            'options' => [
                'temperature' => 0.3,
            ],
        ];

        $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return [
                'status' => 'error',
                'message' => 'Failed to encode Ollama request payload.',
            ];
        }

        $url = $baseUrl . '/api/chat';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 60,
        ]);

        $responseBody = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($responseBody === false) {
            return [
                'status' => 'error',
                'message' => 'Could not reach Ollama at ' . $baseUrl . '. Start Ollama and ensure the server is running.',
            ];
        }

        $decoded = json_decode($responseBody, true);
        if (!is_array($decoded)) {
            return [
                'status' => 'error',
                'message' => 'Ollama returned an invalid response.',
            ];
        }

        if ($httpCode >= 400) {
            $errorMessage = trim((string)($decoded['error'] ?? $decoded['message'] ?? 'Ollama request failed.'));
            $lower = strtolower($errorMessage);
            if (strpos($lower, 'model') !== false && strpos($lower, 'not found') !== false) {
                $errorMessage = 'Ollama model not found. Run: ollama pull ' . $model;
            }

            return [
                'status' => 'error',
                'message' => $errorMessage !== '' ? $errorMessage : 'Ollama request failed.',
            ];
        }

        $reply = trim((string)($decoded['message']['content'] ?? ''));
        if ($reply === '') {
            return [
                'status' => 'error',
                'message' => 'Ollama did not return reply text.',
            ];
        }

        return [
            'status' => 'success',
            'reply' => $reply,
        ];
    }

    private function generateWithGemini($studentContext, $studentAnalyticsContext, $history, $message)
    {
        $apiKey = trim((string)$this->readEnvValue('GEMINI_API_KEY', ''));
        $model = trim((string)$this->readEnvValue('GEMINI_MODEL', 'gemini-flash-latest'));

        if ($apiKey === '') {
            return [
                'status' => 'error',
                'message' => 'GEMINI_API_KEY is missing in .env.',
            ];
        }

        $contents = $this->buildContents($history, $message);

        $payload = [
            'systemInstruction' => [
                'parts' => [
                    ['text' => $this->buildSystemInstruction($studentContext, $studentAnalyticsContext)],
                ],
            ],
            'contents' => $contents,
            'generationConfig' => [
                'temperature' => 0.3,
                'topP' => 0.9,
                'maxOutputTokens' => 512,
            ],
        ];

        $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
            . rawurlencode($model)
            . ':generateContent';

        $apiResult = $this->postJson($url, $payload, $apiKey);
        if ($apiResult['status'] !== 'success') {
            return [
                'status' => 'error',
                'message' => (string)($apiResult['message'] ?? 'Gemini is temporarily unavailable.'),
            ];
        }

        $reply = $this->extractReplyText($apiResult['data']);
        if ($reply === '') {
            return [
                'status' => 'error',
                'message' => 'Gemini did not return reply text.',
            ];
        }

        return [
            'status' => 'success',
            'reply' => $reply,
        ];
    }

    private function buildContents($history, $currentMessage)
    {
        $contents = [];

        if (!is_array($history)) {
            $history = [];
        }

        $history = array_slice($history, -10);

        foreach ($history as $entry) {
            if (!is_array($entry)) {
                continue;
            }

            $role = strtolower(trim((string)($entry['role'] ?? '')));
            $text = trim((string)($entry['content'] ?? ''));

            if ($text === '') {
                continue;
            }

            if (!in_array($role, ['user', 'assistant'], true)) {
                continue;
            }

            if (strlen($text) > 1200) {
                $text = substr($text, 0, 1200);
            }

            $contents[] = [
                'role' => $role === 'assistant' ? 'model' : 'user',
                'parts' => [
                    ['text' => $text],
                ],
            ];
        }

        if (strlen($currentMessage) > 2000) {
            $currentMessage = substr($currentMessage, 0, 2000);
        }

        $contents[] = [
            'role' => 'user',
            'parts' => [
                ['text' => $currentMessage],
            ],
        ];

        return $contents;
    }

    private function getStudentContext($studentPkId)
    {
        $query = "SELECT student_id, first_name, last_name, course, year_level, section
                  FROM students
                  WHERE id = :id
                  LIMIT 1";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([':id' => (int)$studentPkId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return is_array($row) ? $row : null;
    }

    private function buildSystemInstruction($studentContext, $studentAnalyticsContext = '')
    {
        $name = trim((string)($studentContext['first_name'] ?? '')) . ' ' . trim((string)($studentContext['last_name'] ?? ''));
        $name = trim($name);
        $studentId = trim((string)($studentContext['student_id'] ?? ''));
        $course = trim((string)($studentContext['course'] ?? ''));
        $yearLevel = trim((string)($studentContext['year_level'] ?? ''));
        $section = trim((string)($studentContext['section'] ?? ''));
        $backendContext = $this->buildBackendContextForPrompt();

        $contextLines = [
            'Student profile context (for personalization only):',
            '- Name: ' . ($name !== '' ? $name : 'Student'),
            '- Student ID: ' . ($studentId !== '' ? $studentId : 'N/A'),
            '- Course: ' . ($course !== '' ? $course : 'N/A'),
            '- Year Level: ' . ($yearLevel !== '' ? $yearLevel : 'N/A'),
            '- Section: ' . ($section !== '' ? $section : 'N/A'),
        ];

        $rules = [
            'You are the Student Assistant for the QR Attend Smart Campus portal.',
            'Help with attendance workflows, class participation, notifications, and portal usage.',
            'Use the provided live student analytics context to answer questions about classes, performance, and attendance insights.',
            'For classmate questions, use only the provided classmates-by-class context.',
            'Keep answers concise, practical, and student-friendly.',
            'Return plain text only. Do not use markdown symbols such as asterisks, bold markers, or code fences.',
            'Do not invent attendance records, grades, or account state.',
            'If asked for privileged actions or sensitive data, refuse and suggest contacting the teacher/admin.',
            'Never ask for passwords, OTPs, or secret credentials.',
            'If the request is unrelated to the portal, academics, and backend project context, reply briefly and steer back to student support topics.',
        ];

        $instruction = implode("\n", array_merge($rules, [''], $contextLines));

        if (trim((string)$studentAnalyticsContext) !== '') {
            $instruction .= "\n\n" . trim((string)$studentAnalyticsContext);
        }

        if ($backendContext !== '') {
            $instruction .= "\n\nBackend project context for code-aware answers:\n";
            $instruction .= $backendContext;
        }

        return $instruction;
    }

    private function buildBackendContextForPrompt()
    {
        if (!$this->isEnvEnabled('CHATBOT_INCLUDE_BACKEND_CONTEXT', false)) {
            return '';
        }

        $backendRoot = realpath(__DIR__ . '/..');
        if ($backendRoot === false || !is_dir($backendRoot)) {
            return '';
        }

        $allowedExtensions = ['php', 'sql'];
        $maxChars = $this->readIntEnvValue('CHATBOT_BACKEND_CONTEXT_MAX_CHARS', 220000, 20000, 500000);
        $rootWithSlashes = str_replace('\\', '/', $backendRoot);

        $sections = [];

        try {
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($backendRoot, FilesystemIterator::SKIP_DOTS)
            );

            foreach ($iterator as $fileInfo) {
                if (!$fileInfo->isFile()) {
                    continue;
                }

                $extension = strtolower((string)$fileInfo->getExtension());
                if (!in_array($extension, $allowedExtensions, true)) {
                    continue;
                }

                $normalizedPath = str_replace('\\', '/', $fileInfo->getPathname());
                if (strpos($normalizedPath, '/PHPMailer/') !== false) {
                    continue;
                }

                $relativePath = ltrim(str_replace($rootWithSlashes, '', $normalizedPath), '/');
                if ($relativePath === '') {
                    continue;
                }

                $content = @file_get_contents($fileInfo->getPathname());
                if ($content === false || trim($content) === '') {
                    continue;
                }

                $projectPath = 'backend/' . $relativePath;
                $section = "BEGIN FILE: " . $projectPath . "\n"
                    . $content . "\n"
                    . "END FILE: " . $projectPath . "\n\n";

                $sections[] = [
                    'path' => $projectPath,
                    'section' => $section,
                ];
            }
        } catch (Exception $e) {
            return '';
        }

        if (empty($sections)) {
            return '';
        }

        usort($sections, function ($a, $b) {
            return strcmp((string)$a['path'], (string)$b['path']);
        });

        $context = "Backend file index:\n";
        foreach ($sections as $item) {
            $context .= '- ' . $item['path'] . "\n";
        }
        $context .= "\nBackend source code:\n";

        $included = 0;
        $total = count($sections);

        foreach ($sections as $item) {
            $next = (string)$item['section'];
            if (strlen($context) + strlen($next) > $maxChars) {
                break;
            }

            $context .= $next;
            $included++;
        }

        if ($included < $total) {
            $context .= "[Backend context truncated: included " . $included . " of " . $total . " files due CHATBOT_BACKEND_CONTEXT_MAX_CHARS limit.]\n";
        }

        return $context;
    }

    private function isEnvEnabled($key, $default = false)
    {
        $fallback = $default ? '1' : '0';
        $value = strtolower(trim((string)$this->readEnvValue($key, $fallback)));

        return in_array($value, ['1', 'true', 'yes', 'on'], true);
    }

    private function readIntEnvValue($key, $default, $min, $max)
    {
        $raw = (string)$this->readEnvValue($key, (string)$default);
        $value = (int)$raw;

        if ($value < $min) {
            return (int)$min;
        }

        if ($value > $max) {
            return (int)$max;
        }

        return $value;
    }

    private function postJson($url, $payload, $apiKey = '')
    {
        if (!function_exists('curl_init')) {
            return [
                'status' => 'error',
                'code' => 'service_unavailable',
                'message' => 'cURL is not enabled on the server.',
            ];
        }

        $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return [
                'status' => 'error',
                'code' => 'internal_error',
                'message' => 'Failed to encode chat request payload.',
            ];
        }

        $headers = [
            'Content-Type: application/json',
        ];

        $apiKey = trim((string)$apiKey);
        if ($apiKey !== '') {
            $headers[] = 'X-goog-api-key: ' . $apiKey;
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 25,
        ]);

        $responseBody = curl_exec($ch);
        $curlError = curl_error($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($responseBody === false) {
            return [
                'status' => 'error',
                'code' => 'network_error',
                'message' => $curlError !== '' ? $curlError : 'Unknown network error.',
            ];
        }

        $decoded = json_decode($responseBody, true);
        if (!is_array($decoded)) {
            return [
                'status' => 'error',
                'code' => 'invalid_response',
                'message' => 'Chat service returned an invalid response.',
            ];
        }

        if ($httpCode >= 400) {
            $rawMessage = trim((string)($decoded['error']['message'] ?? 'Chat service error.'));
            $lower = strtolower($rawMessage);

            if (strpos($lower, 'quota') !== false || strpos($lower, 'rate limit') !== false || strpos($lower, 'exceeded') !== false) {
                return [
                    'status' => 'error',
                    'code' => 'quota_exceeded',
                    'message' => 'AI response quota is currently exhausted.',
                ];
            }

            if (strpos($lower, 'api key') !== false || strpos($lower, 'permission') !== false || strpos($lower, 'unauthorized') !== false) {
                return [
                    'status' => 'error',
                    'code' => 'auth_error',
                    'message' => 'AI service authentication failed.',
                ];
            }

            return [
                'status' => 'error',
                'code' => 'service_error',
                'message' => $rawMessage !== '' ? $rawMessage : 'Chat service error.',
            ];
        }

        return [
            'status' => 'success',
            'data' => $decoded,
        ];
    }

    private function extractReplyText($response)
    {
        if (!is_array($response)) {
            return '';
        }

        $parts = $response['candidates'][0]['content']['parts'] ?? [];
        if (!is_array($parts)) {
            return '';
        }

        $texts = [];
        foreach ($parts as $part) {
            if (!is_array($part)) {
                continue;
            }

            $text = trim((string)($part['text'] ?? ''));
            if ($text !== '') {
                $texts[] = $text;
            }
        }

        return trim(implode("\n", $texts));
    }

    private function sanitizeAssistantReply($reply)
    {
        $text = trim((string)$reply);
        if ($text === '') {
            return '';
        }

        $text = str_replace(["\r\n", "\r"], "\n", $text);

        // Frontend renders plain text, so strip markdown markers for cleaner output.
        $text = str_replace(['**', '__', '`'], '', $text);
        $text = preg_replace('/^\s*[*+]\s+/m', '- ', $text);
        $text = preg_replace('/^\s*#{1,6}\s*/m', '', $text);
        $text = str_replace('*', '', $text);
        $text = preg_replace("/\n{3,}/", "\n\n", $text);

        return trim((string)$text);
    }

    private function readEnvValue($key, $default = null)
    {
        $processValue = getenv($key);
        if ($processValue !== false && trim((string)$processValue) !== '') {
            return trim((string)$processValue);
        }

        $dotEnvValue = $this->getDotEnvValue($key);
        if ($dotEnvValue !== null && $dotEnvValue !== '') {
            return $dotEnvValue;
        }

        return $default;
    }

    private function getDotEnvValue($key)
    {
        if (self::$dotEnvCache === null) {
            self::$dotEnvCache = [];
            $envPath = __DIR__ . '/../../.env';

            if (is_file($envPath) && is_readable($envPath)) {
                $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                if (is_array($lines)) {
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
                            $last = $value[strlen($value) - 1];
                            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                                $value = substr($value, 1, -1);
                            }
                        }

                        self::$dotEnvCache[$name] = $value;
                    }
                }
            }
        }

        return self::$dotEnvCache[$key] ?? null;
    }
}
