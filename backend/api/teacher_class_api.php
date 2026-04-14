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

function extractServiceData($result)
{
    $data = $result;
    unset($data['status'], $data['message'], $data['httpCode']);
    return empty($data) ? null : $data;
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

        $result = $teacherClass->listByStudent($studentPkId);
        sendJsonResponse($result['status'], 'Classes fetched.', ['classes' => $result['classes'] ?? []]);
    }

    // Public: get class info for registration page (no auth required)
    if ($action === 'get_class') {
        $classId = (int)($_GET['id'] ?? 0);
        if ($classId <= 0) {
            sendJsonResponse('error', 'Class ID is required.', null, 422);
        }

        $result = $teacherClass->getPublicClass($classId);
        sendJsonResponse(
            $result['status'],
            $result['message'],
            extractServiceData($result),
            $result['httpCode'] ?? 200
        );
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

            $result = $teacherClass->registerLoggedInStudent($classId, $studentPkId);
            sendJsonResponse(
                $result['status'],
                $result['message'],
                extractServiceData($result),
                $result['httpCode'] ?? 200
            );
        }

        // New student registration
        $payload = array_merge($jsonBody, $_POST);

        $result = $teacherClass->registerNewStudent($classId, $payload);
        if ($result['status'] === 'success') {
            $auth->studentLoginById((int)$result['student_id']);
        }

        sendJsonResponse(
            $result['status'],
            $result['message'],
            extractServiceData($result),
            $result['httpCode'] ?? 200
        );
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
