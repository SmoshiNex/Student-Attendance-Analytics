<?php

ini_set('display_errors', 0);
error_reporting(E_ALL);

require_once '../class/SessionConfig.php';

header('Content-Type: application/json');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (
    $origin !== '' &&
    preg_match(
        '/^https?:\/\/((localhost|127\.0\.0\.1)|(10\.\d{1,3}\.\d{1,3}\.\d{1,3})|(192\.168\.\d{1,3}\.\d{1,3})|(172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}))(:\d+)?$/i',
        $origin
    )
) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}

header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function sendJsonResponse($status, $message, $data = null, $httpCode = 200)
{
    http_response_code($httpCode);
    $response = [
        'status' => $status,
        'message' => $message,
    ];

    if ($data !== null) {
        $response = array_merge($response, $data);
    }

    echo json_encode($response);
    exit;
}

function getJsonBody()
{
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function getDeletePayload()
{
    parse_str(file_get_contents('php://input'), $deleteData);
    return is_array($deleteData) ? $deleteData : [];
}

try {
    require_once '../class/Database.php';
    require_once '../class/Auth.php';
    require_once '../class/TeacherClass.php';

    $database = new Database();
    $db = $database->connect();

    $auth = new Auth($db);
    $teacherClass = new TeacherClass($db);

    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';
    $jsonBody = getJsonBody();

    if ($method === 'POST' && isset($_POST['_method'])) {
        $overrideMethod = strtoupper((string)$_POST['_method']);
        if (in_array($overrideMethod, ['PUT', 'PATCH', 'DELETE'], true)) {
            $method = $overrideMethod;
        }
    }

    if ($action === 'my_classes') {
        if (!$auth->isStudentLoggedIn()) {
            sendJsonResponse('error', 'Unauthorized', null, 401);
        }
        $studentPkId = $auth->getStudentSessionId();
        $query = "SELECT c.id, c.class_code, c.class_name, c.subject_name, c.schedule, c.room,
                         t.first_name, t.last_name
                  FROM class_student cs
                  INNER JOIN teacher_classes c ON c.id = cs.teacher_class_id
                  INNER JOIN teachers t ON t.id = c.teacher_id
                  WHERE cs.student_id = :student_id
                  ORDER BY c.id DESC";
        $stmt = $db->prepare($query);
        $stmt->execute([':student_id' => $studentPkId]);
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

            $classmateStmt = $db->prepare($classmateQuery);
            $classmateStmt->execute(array_merge($classIds, [(int)$studentPkId]));
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
                'teacher' => ['first_name' => $row['first_name'], 'last_name' => $row['last_name']],
                'classmate_count' => count($classmates),
                'classmates' => $classmates,
            ];
        }, is_array($rows) ? $rows : []);
        sendJsonResponse('success', 'Classes fetched.', ['classes' => $classes]);
    }

    // Public: get class info for registration page (no auth required)
    if ($action === 'get_class') {
        $classId = (int)($_GET['id'] ?? 0);
        if ($classId <= 0) {
            sendJsonResponse('error', 'Class ID is required.', null, 422);
        }
        $stmt = $db->prepare(
            "SELECT c.id, c.class_code, c.class_name, c.subject_name, c.schedule, c.room,
                    t.first_name, t.last_name
             FROM teacher_classes c
             INNER JOIN teachers t ON t.id = c.teacher_id
             WHERE c.id = :id LIMIT 1"
        );
        $stmt->execute([':id' => $classId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            sendJsonResponse('error', 'Class not found.', null, 404);
        }
        sendJsonResponse('success', 'Class fetched.', [
            'class' => [
                'id' => $row['id'],
                'class_code' => $row['class_code'],
                'class_name' => $row['class_name'],
                'subject_name' => $row['subject_name'],
                'schedule' => $row['schedule'],
                'room' => $row['room'],
                'teacher' => ['first_name' => $row['first_name'], 'last_name' => $row['last_name']],
            ]
        ]);
    }

    // Public: register a student into a class
    if ($action === 'register_student' && $method === 'POST') {
        $classId = (int)($_GET['class_id'] ?? $jsonBody['class_id'] ?? 0);
        if ($classId <= 0) {
            sendJsonResponse('error', 'class_id is required.', null, 422);
        }

        // If student is already logged in, just enroll them
        if ($auth->isStudentLoggedIn()) {
            $studentPkId = $auth->getStudentSessionId();
            $check = $db->prepare("SELECT id FROM class_student WHERE teacher_class_id = :cid AND student_id = :sid LIMIT 1");
            $check->execute([':cid' => $classId, ':sid' => $studentPkId]);
            if ($check->fetch()) {
                sendJsonResponse('error', 'You are already enrolled in this class.', null, 422);
            }
            $db->prepare("INSERT INTO class_student (teacher_class_id, student_id, created_at, updated_at) VALUES (:cid, :sid, NOW(), NOW())")
               ->execute([':cid' => $classId, ':sid' => $studentPkId]);
            sendJsonResponse('success', 'Enrolled successfully.');
        }

        // New student registration
        $payload = array_merge($jsonBody, $_POST);
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
            http_response_code(422);
            echo json_encode(['status' => 'error', 'message' => 'Validation failed.', 'errors' => $fieldErrors]);
            exit;
        }

        // Check if student_id already exists
        $exists = $db->prepare("SELECT id FROM students WHERE student_id = :sid LIMIT 1");
        $exists->execute([':sid' => $studentId]);
        $existingStudent = $exists->fetch(PDO::FETCH_ASSOC);

        if ($existingStudent) {
            // Student exists — just enroll them
            $studentPkId = (int)$existingStudent['id'];
        } else {
            // Check email uniqueness
            $emailCheck = $db->prepare("SELECT id FROM students WHERE email = :email LIMIT 1");
            $emailCheck->execute([':email' => $email]);
            if ($emailCheck->fetch()) {
                http_response_code(422);
                echo json_encode(['status' => 'error', 'message' => 'Validation failed.', 'errors' => ['email' => 'This email is already registered.']]);
                exit;
            }

            // Create new student with all required columns
            $db->prepare(
                "INSERT INTO students
                    (student_id, first_name, last_name, email, course, year_level, section, parent_email, password, created_at, updated_at)
                 VALUES
                    (:student_id, :first_name, :last_name, :email, :course, :year_level, :section, :parent_email, :password, NOW(), NOW())"
            )->execute([
                ':student_id'   => $studentId,
                ':first_name'   => $firstName,
                ':last_name'    => $lastName,
                ':email'        => $email,
                ':course'       => $course,
                ':year_level'   => $yearLevel,
                ':section'      => $section,
                ':parent_email' => $parentEmail,
                ':password'     => password_hash($password, PASSWORD_DEFAULT),
            ]);
            $studentPkId = (int)$db->lastInsertId();
        }

        // Enroll in class (ignore duplicate)
        $checkEnroll = $db->prepare("SELECT id FROM class_student WHERE teacher_class_id = :cid AND student_id = :sid LIMIT 1");
        $checkEnroll->execute([':cid' => $classId, ':sid' => $studentPkId]);
        if (!$checkEnroll->fetch()) {
            $db->prepare("INSERT INTO class_student (teacher_class_id, student_id, created_at, updated_at) VALUES (:cid, :sid, NOW(), NOW())")
               ->execute([':cid' => $classId, ':sid' => $studentPkId]);
        }

        // Log them in
        $auth->studentLoginById($studentPkId);
        sendJsonResponse('success', 'Enrolled successfully.');
    }

    if (!$auth->isTeacherLoggedIn()) {
        sendJsonResponse('error', 'Unauthorized', null, 401);
    }

    $teacherId = $auth->getTeacherSessionId();

    switch ($method) {
        case 'GET':
            if ($action === 'students') {
                $classId = (int)($_GET['id'] ?? $_GET['class_id'] ?? 0);
                if ($classId <= 0) {
                    sendJsonResponse('error', 'Class ID is required.', null, 422);
                }

                $result = $teacherClass->listStudents($classId, $teacherId);
                $code = ($result['status'] === 'success') ? 200 : 422;
                sendJsonResponse($result['status'], $result['status'] === 'success' ? 'Students fetched.' : $result['message'], ['students' => $result['students'] ?? []], $code);
            }

            if (isset($_GET['id'])) {
                $result = $teacherClass->readOne((int)$_GET['id'], $teacherId);
                $code = ($result['status'] === 'success') ? 200 : 404;
                sendJsonResponse($result['status'], $result['status'] === 'success' ? 'Class fetched.' : $result['message'], ['class' => $result['class'] ?? null], $code);
            }

            $result = $teacherClass->listByTeacher($teacherId);
            sendJsonResponse($result['status'], 'Classes fetched.', ['classes' => $result['classes']]);
            break;

        case 'POST':
            $payload = array_merge($jsonBody, $_POST);
            $result = $teacherClass->create($teacherId, $payload);
            $code = ($result['status'] === 'success') ? 201 : 422;
            sendJsonResponse($result['status'], $result['message'], ['class_id' => $result['class_id'] ?? null], $code);
            break;

        case 'PUT':
        case 'PATCH':
            $payload = array_merge($jsonBody, $_POST);
            $classId = $payload['id'] ?? $_GET['id'] ?? null;

            if (!$classId) {
                sendJsonResponse('error', 'Class ID is required.', null, 422);
            }

            $result = $teacherClass->update((int)$classId, $teacherId, $payload);
            $code = ($result['status'] === 'success') ? 200 : 422;
            sendJsonResponse($result['status'], $result['message'], null, $code);
            break;

        case 'DELETE':
            $payload = array_merge($jsonBody, getDeletePayload());
            $classId = $payload['id'] ?? $_GET['id'] ?? null;

            if (!$classId) {
                sendJsonResponse('error', 'Class ID is required.', null, 422);
            }

            $result = $teacherClass->delete((int)$classId, $teacherId);
            $code = ($result['status'] === 'success') ? 200 : 422;
            sendJsonResponse($result['status'], $result['message'], null, $code);
            break;

        default:
            sendJsonResponse('error', 'Method not supported.', null, 405);
    }
} catch (Exception $e) {
    sendJsonResponse('error', $e->getMessage(), null, 500);
}
