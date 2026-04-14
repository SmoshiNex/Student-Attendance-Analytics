<?php

class TeacherClass
{
    private $conn;
    private $table = 'teacher_classes';

    public function __construct($db)
    {
        $this->conn = $db;
    }

    private function validateClassData($data)
    {
        $classCode = trim((string)($data['class_code'] ?? ''));
        $className = isset($data['class_name']) ? trim((string)$data['class_name']) : null;
        $subjectName = trim((string)($data['subject_name'] ?? ''));
        $schedule = trim((string)($data['schedule'] ?? ''));
        $room = isset($data['room']) ? trim((string)$data['room']) : null;

        if ($classCode === '' || $subjectName === '' || $schedule === '') {
            return [
                'status' => 'error',
                'message' => 'class_code, subject_name, and schedule are required.'
            ];
        }

        if (strlen($classCode) > 255 || strlen($subjectName) > 255 || strlen($schedule) > 255) {
            return [
                'status' => 'error',
                'message' => 'class_code, subject_name, and schedule must not exceed 255 characters.'
            ];
        }

        if ($className !== null && strlen($className) > 255) {
            return [
                'status' => 'error',
                'message' => 'class_name must not exceed 255 characters.'
            ];
        }

        if ($room !== null && strlen($room) > 255) {
            return [
                'status' => 'error',
                'message' => 'room must not exceed 255 characters.'
            ];
        }

        return [
            'status' => 'success',
            'data' => [
                'class_code' => $classCode,
                'class_name' => ($className === '') ? null : $className,
                'subject_name' => $subjectName,
                'schedule' => $schedule,
                'room' => ($room === '') ? null : $room,
            ]
        ];
    }

    private function classBelongsToTeacher($classId, $teacherId)
    {
        // Check if this class belongs to the given teacher — used before any update or delete to prevent unauthorized access
        $query = "SELECT id FROM {$this->table} WHERE id = :id AND teacher_id = :teacher_id LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':id' => (int)$classId,
            ':teacher_id' => (int)$teacherId
        ]);

        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    }

    private function isStudentEnrolled($classId, $studentId)
    {
        $query = "SELECT id FROM class_student WHERE teacher_class_id = :cid AND student_id = :sid LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':cid' => (int)$classId,
            ':sid' => (int)$studentId,
        ]);

        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    }

    private function enrollStudent($classId, $studentId)
    {
        $query = "INSERT INTO class_student (teacher_class_id, student_id, created_at, updated_at)
                  VALUES (:cid, :sid, NOW(), NOW())";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':cid' => (int)$classId,
            ':sid' => (int)$studentId,
        ]);
    }

    private function validateStudentRegistrationPayload($payload)
    {
        $studentId    = trim((string)($payload['student_id'] ?? ''));
        $firstName    = trim((string)($payload['first_name'] ?? ''));
        $lastName     = trim((string)($payload['last_name'] ?? ''));
        $email        = trim((string)($payload['email'] ?? ''));
        $course       = trim((string)($payload['course'] ?? ''));
        $yearLevel    = trim((string)($payload['year_level'] ?? ''));
        $section      = trim((string)($payload['section'] ?? ''));
        $parentEmail  = trim((string)($payload['parent_email'] ?? ''));
        $password     = (string)($payload['password'] ?? '');
        $passwordConf = (string)($payload['password_confirmation'] ?? '');

        $fieldErrors = [];
        if ($studentId === '') {
            $fieldErrors['student_id']   = 'Student ID is required.';
        }
        if ($firstName === '') {
            $fieldErrors['first_name']   = 'First name is required.';
        }
        if ($lastName === '') {
            $fieldErrors['last_name']    = 'Last name is required.';
        }
        if ($email === '') {
            $fieldErrors['email']        = 'Email is required.';
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $fieldErrors['email'] = 'Invalid email format.';
        }
        if ($course === '') {
            $fieldErrors['course']       = 'Course is required.';
        }
        if ($yearLevel === '') {
            $fieldErrors['year_level']   = 'Year level is required.';
        }
        if ($section === '') {
            $fieldErrors['section']      = 'Section is required.';
        }
        if ($parentEmail === '') {
            $fieldErrors['parent_email'] = 'Parent email is required.';
        } elseif (!filter_var($parentEmail, FILTER_VALIDATE_EMAIL)) {
            $fieldErrors['parent_email'] = 'Invalid parent email format.';
        }
        if ($password === '') {
            $fieldErrors['password']     = 'Password is required.';
        } elseif (strlen($password) < 8) {
            $fieldErrors['password'] = 'Password must be at least 8 characters.';
        } elseif (!preg_match('/\d/', $password)) {
            $fieldErrors['password'] = 'Password must include at least 1 number.';
        } elseif (!preg_match('/[a-z]/', $password)) {
            $fieldErrors['password'] = 'Password must include at least 1 lowercase letter.';
        } elseif (!preg_match('/[A-Z]/', $password)) {
            $fieldErrors['password'] = 'Password must include at least 1 uppercase letter.';
        } elseif ($password !== $passwordConf) {
            $fieldErrors['password_confirmation'] = 'Passwords do not match.';
        }

        if (!empty($fieldErrors)) {
            return [
                'status' => 'error',
                'message' => 'Validation failed.',
                'errors' => $fieldErrors,
                'httpCode' => 422,
            ];
        }

        return [
            'status' => 'success',
            'data' => [
                'student_id' => $studentId,
                'first_name' => $firstName,
                'last_name' => $lastName,
                'email' => $email,
                'course' => $course,
                'year_level' => $yearLevel,
                'section' => $section,
                'parent_email' => $parentEmail,
                'password' => $password,
            ],
        ];
    }

    public function listByStudent($studentId)
    {
        $query = "SELECT c.id, c.class_code, c.class_name, c.subject_name, c.schedule, c.room,
                         t.id AS teacher_id, t.first_name, t.last_name
                  FROM class_student cs
                  INNER JOIN teacher_classes c ON c.id = cs.teacher_class_id
                  INNER JOIN teachers t ON t.id = c.teacher_id
                  WHERE cs.student_id = :student_id
                  ORDER BY c.id DESC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([':student_id' => (int)$studentId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $classmatesByClass = [];
        $classIds = array_values(array_unique(array_map(function ($row) {
            return (int)($row['id'] ?? 0);
        }, is_array($rows) ? $rows : [])));

        if (!empty($classIds)) {
            $placeholders = implode(', ', array_fill(0, count($classIds), '?'));
            $classmateQuery = "SELECT cs.teacher_class_id,
                                      s.student_id,
                                      s.first_name,
                                      s.last_name,
                                      s.course,
                                      s.year_level,
                                      s.section
                               FROM class_student cs
                               INNER JOIN students s ON s.id = cs.student_id
                               WHERE cs.teacher_class_id IN (" . $placeholders . ")
                                 AND cs.student_id <> ?
                               ORDER BY cs.teacher_class_id ASC, s.last_name ASC, s.first_name ASC";

            $classmateStmt = $this->conn->prepare($classmateQuery);
            $classmateStmt->execute(array_merge($classIds, [(int)$studentId]));
            $classmateRows = $classmateStmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($classmateRows as $classmateRow) {
                $classId = (int)($classmateRow['teacher_class_id'] ?? 0);
                if ($classId <= 0) {
                    continue;
                }

                if (!isset($classmatesByClass[$classId])) {
                    $classmatesByClass[$classId] = [];
                }

                $classmatesByClass[$classId][] = [
                    'student_id' => (string)($classmateRow['student_id'] ?? ''),
                    'first_name' => (string)($classmateRow['first_name'] ?? ''),
                    'last_name' => (string)($classmateRow['last_name'] ?? ''),
                    'course' => (string)($classmateRow['course'] ?? ''),
                    'year_level' => (string)($classmateRow['year_level'] ?? ''),
                    'section' => (string)($classmateRow['section'] ?? ''),
                ];
            }
        }

        $classes = array_map(function ($row) use ($classmatesByClass) {
            $classId = (int)($row['id'] ?? 0);
            $classmates = $classmatesByClass[$classId] ?? [];

            return [
                'id' => $row['id'],
                'class_code' => $row['class_code'],
                'class_name' => $row['class_name'],
                'subject_name' => $row['subject_name'],
                'schedule' => $row['schedule'],
                'room' => $row['room'],
                'teacher' => [
                    'id' => (int)$row['teacher_id'],
                    'first_name' => $row['first_name'],
                    'last_name' => $row['last_name'],
                ],
                'classmate_count' => count($classmates),
                'classmates' => $classmates,
            ];
        }, is_array($rows) ? $rows : []);

        return [
            'status' => 'success',
            'classes' => $classes,
        ];
    }

    public function getPublicClass($classId)
    {
        $stmt = $this->conn->prepare(
            "SELECT c.id, c.class_code, c.class_name, c.subject_name, c.schedule, c.room,
                    t.first_name, t.last_name
             FROM teacher_classes c
             INNER JOIN teachers t ON t.id = c.teacher_id
             WHERE c.id = :id LIMIT 1"
        );
        $stmt->execute([':id' => (int)$classId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return [
                'status' => 'error',
                'message' => 'Class not found.',
                'httpCode' => 404,
            ];
        }

        return [
            'status' => 'success',
            'message' => 'Class fetched.',
            'class' => [
                'id' => $row['id'],
                'class_code' => $row['class_code'],
                'class_name' => $row['class_name'],
                'subject_name' => $row['subject_name'],
                'schedule' => $row['schedule'],
                'room' => $row['room'],
                'teacher' => [
                    'first_name' => $row['first_name'],
                    'last_name' => $row['last_name'],
                ],
            ],
        ];
    }

    public function registerLoggedInStudent($classId, $studentId)
    {
        if ($this->isStudentEnrolled($classId, $studentId)) {
            return [
                'status' => 'error',
                'message' => 'You are already enrolled in this class.',
                'httpCode' => 422,
            ];
        }

        $this->enrollStudent($classId, $studentId);

        return [
            'status' => 'success',
            'message' => 'Enrolled successfully.',
        ];
    }

    public function registerNewStudent($classId, $payload)
    {
        $validation = $this->validateStudentRegistrationPayload($payload);
        if ($validation['status'] === 'error') {
            return $validation;
        }

        $data = $validation['data'];

        $exists = $this->conn->prepare("SELECT id FROM students WHERE student_id = :sid LIMIT 1");
        $exists->execute([':sid' => $data['student_id']]);
        $existingStudent = $exists->fetch(PDO::FETCH_ASSOC);

        if ($existingStudent) {
            $studentPkId = (int)$existingStudent['id'];
        } else {
            $emailCheck = $this->conn->prepare("SELECT id FROM students WHERE email = :email LIMIT 1");
            $emailCheck->execute([':email' => $data['email']]);
            if ($emailCheck->fetch()) {
                return [
                    'status' => 'error',
                    'message' => 'Validation failed.',
                    'errors' => ['email' => 'This email is already registered.'],
                    'httpCode' => 422,
                ];
            }

            $this->conn->prepare(
                "INSERT INTO students
                    (student_id, first_name, last_name, email, course, year_level, section, parent_email, password, created_at, updated_at)
                 VALUES
                    (:student_id, :first_name, :last_name, :email, :course, :year_level, :section, :parent_email, :password, NOW(), NOW())"
            )->execute([
                ':student_id' => $data['student_id'],
                ':first_name' => $data['first_name'],
                ':last_name' => $data['last_name'],
                ':email' => $data['email'],
                ':course' => $data['course'],
                ':year_level' => $data['year_level'],
                ':section' => $data['section'],
                ':parent_email' => $data['parent_email'],
                ':password' => password_hash($data['password'], PASSWORD_DEFAULT),
            ]);

            $studentPkId = (int)$this->conn->lastInsertId();
        }

        if (!$this->isStudentEnrolled($classId, $studentPkId)) {
            $this->enrollStudent($classId, $studentPkId);
        }

        return [
            'status' => 'success',
            'message' => 'Enrolled successfully.',
            'student_id' => $studentPkId,
        ];
    }

    public function listByTeacher($teacherId)
    {
        // SQL FEATURE: SUB QUERY (3 of 3)
        // Fetch all classes for this teacher with the count of enrolled students per class
        $query = "SELECT c.id, c.teacher_id, c.class_code, c.class_name, c.subject_name, c.schedule, c.room, c.created_at, c.updated_at,
                         COUNT(cs.student_id) AS students_enrolled
                  FROM {$this->table} c
                  LEFT JOIN class_student cs ON cs.teacher_class_id = c.id
                  WHERE c.teacher_id = :teacher_id
                  GROUP BY c.id, c.teacher_id, c.class_code, c.class_name, c.subject_name, c.schedule, c.room, c.created_at, c.updated_at
                  ORDER BY c.id DESC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([':teacher_id' => (int)$teacherId]);

        return [
            'status' => 'success',
            'classes' => $stmt->fetchAll(PDO::FETCH_ASSOC)
        ];
    }

    public function readOne($classId, $teacherId)
    {
        // Fetch a single class with its enrolled student count — verifies teacher ownership via WHERE clause
        $query = "SELECT c.id, c.teacher_id, c.class_code, c.class_name, c.subject_name, c.schedule, c.room, c.created_at, c.updated_at,
                         COUNT(cs.student_id) AS students_enrolled
                  FROM {$this->table} c
                  LEFT JOIN class_student cs ON cs.teacher_class_id = c.id
                  WHERE c.id = :id AND c.teacher_id = :teacher_id
                  GROUP BY c.id, c.teacher_id, c.class_code, c.class_name, c.subject_name, c.schedule, c.room, c.created_at, c.updated_at
                  LIMIT 1";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':id' => (int)$classId,
            ':teacher_id' => (int)$teacherId
        ]);

        $classItem = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$classItem) {
            return [
                'status' => 'error',
                'message' => 'Class not found.'
            ];
        }

        return [
            'status' => 'success',
            'class' => $classItem
        ];
    }

    public function listStudents($classId, $teacherId)
    {
        if (!$this->classBelongsToTeacher($classId, $teacherId)) {
            return [
                'status' => 'error',
                'message' => 'Unauthorized or class not found.'
            ];
        }

        // Fetch all students enrolled in this class ordered alphabetically by last name
        $query = "SELECT s.id, s.student_id, s.first_name, s.last_name, s.email, s.course, s.year_level, s.section
                  FROM class_student cs
                  INNER JOIN students s ON s.id = cs.student_id
                  WHERE cs.teacher_class_id = :class_id
                  ORDER BY s.last_name ASC, s.first_name ASC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([':class_id' => (int)$classId]);

        return [
            'status' => 'success',
            'students' => $stmt->fetchAll(PDO::FETCH_ASSOC),
        ];
    }

    public function create($teacherId, $data)
    {
        $validation = $this->validateClassData($data);
        if ($validation['status'] === 'error') {
            return $validation;
        }

        $validData = $validation['data'];

        // Insert a new class record for this teacher
        $query = "INSERT INTO {$this->table} (teacher_id, class_code, class_name, subject_name, schedule, room, created_at, updated_at)
                  VALUES (:teacher_id, :class_code, :class_name, :subject_name, :schedule, :room, NOW(), NOW())";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':teacher_id' => (int)$teacherId,
            ':class_code' => $validData['class_code'],
            ':class_name' => $validData['class_name'],
            ':subject_name' => $validData['subject_name'],
            ':schedule' => $validData['schedule'],
            ':room' => $validData['room']
        ]);

        return [
            'status' => 'success',
            'message' => 'Class created successfully.',
            'class_id' => (int)$this->conn->lastInsertId()
        ];
    }

    public function update($classId, $teacherId, $data)
    {
        if (!$this->classBelongsToTeacher($classId, $teacherId)) {
            return [
                'status' => 'error',
                'message' => 'Unauthorized or class not found.'
            ];
        }

        $validation = $this->validateClassData($data);
        if ($validation['status'] === 'error') {
            return $validation;
        }

        $validData = $validation['data'];

        // Update the class fields — teacher_id in WHERE clause ensures a teacher can only edit their own classes
        $query = "UPDATE {$this->table}
                  SET class_code = :class_code,
                      class_name = :class_name,
                      subject_name = :subject_name,
                      schedule = :schedule,
                      room = :room,
                      updated_at = NOW()
                  WHERE id = :id AND teacher_id = :teacher_id";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':class_code' => $validData['class_code'],
            ':class_name' => $validData['class_name'],
            ':subject_name' => $validData['subject_name'],
            ':schedule' => $validData['schedule'],
            ':room' => $validData['room'],
            ':id' => (int)$classId,
            ':teacher_id' => (int)$teacherId
        ]);

        return [
            'status' => 'success',
            'message' => 'Class updated successfully.'
        ];
    }

    public function delete($classId, $teacherId)
    {
        if (!$this->classBelongsToTeacher($classId, $teacherId)) {
            return [
                'status' => 'error',
                'message' => 'Unauthorized or class not found.'
            ];
        }

        // Delete the class — teacher_id in WHERE clause ensures a teacher can only delete their own classes
        $query = "DELETE FROM {$this->table} WHERE id = :id AND teacher_id = :teacher_id";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':id' => (int)$classId,
            ':teacher_id' => (int)$teacherId
        ]);

        return [
            'status' => 'success',
            'message' => 'Class deleted successfully.'
        ];
    }
}
