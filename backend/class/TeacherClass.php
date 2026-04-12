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
        $query = "SELECT id FROM {$this->table} WHERE id = :id AND teacher_id = :teacher_id LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':id' => (int)$classId,
            ':teacher_id' => (int)$teacherId
        ]);

        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    }

    public function listByTeacher($teacherId)
    {
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
