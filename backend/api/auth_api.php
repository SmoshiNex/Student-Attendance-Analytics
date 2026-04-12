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
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

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

try {
    require_once '../class/Database.php';
    require_once '../class/Auth.php';

    $database = new Database();
    $db = $database->connect();
    $auth = new Auth($db);

    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

    $jsonBody = getJsonBody();
    $payload = array_merge($jsonBody, $_POST);

    if ($action === '') {
        throw new Exception('Action is required.');
    }

    switch ($action) {
        case 'teacher_register':
            if ($method !== 'POST') {
                throw new Exception('Method not supported.');
            }

            $result = $auth->teacherRegister(
                $payload['first_name'] ?? '',
                $payload['last_name'] ?? '',
                $payload['email'] ?? '',
                $payload['department'] ?? '',
                $payload['password'] ?? '',
                $payload['password_confirmation'] ?? ''
            );

            $code = ($result['status'] === 'success') ? 201 : 422;
            sendJsonResponse($result['status'], $result['message'], null, $code);
            break;

        case 'unified_login':
            if ($method !== 'POST') {
                throw new Exception('Method not supported.');
            }

            $identifier = trim((string)($payload['identifier'] ?? ''));
            $password = (string)($payload['password'] ?? '');

            if ($identifier === '' || $password === '') {
                sendJsonResponse('error', 'Email/Student ID and password are required.', null, 422);
            }

            if (filter_var($identifier, FILTER_VALIDATE_EMAIL)) {
                $result = $auth->teacherLogin($identifier, $password);
                $code = ($result['status'] === 'success') ? 200 : 401;
                sendJsonResponse($result['status'], $result['message'], ['teacher' => $result['teacher'] ?? null], $code);
            }

            $result = $auth->studentLogin($identifier, $password);
            $code = ($result['status'] === 'success') ? 200 : 401;
            sendJsonResponse($result['status'], $result['message'], ['student' => $result['student'] ?? null], $code);
            break;

        case 'student_login':
            if ($method !== 'POST') {
                throw new Exception('Method not supported.');
            }

            $result = $auth->studentLogin($payload['student_id'] ?? '', $payload['password'] ?? '');
            $code = ($result['status'] === 'success') ? 200 : 401;
            sendJsonResponse($result['status'], $result['message'], ['student' => $result['student'] ?? null], $code);
            break;

        case 'teacher_login':
            if ($method !== 'POST') {
                throw new Exception('Method not supported.');
            }

            $result = $auth->teacherLogin($payload['email'] ?? '', $payload['password'] ?? '');
            $code = ($result['status'] === 'success') ? 200 : 401;
            sendJsonResponse($result['status'], $result['message'], ['teacher' => $result['teacher'] ?? null], $code);
            break;

        case 'teacher_reset_password':
            if ($method !== 'POST') {
                throw new Exception('Method not supported.');
            }

            $result = $auth->teacherResetPassword(
                $payload['email'] ?? '',
                $payload['password'] ?? '',
                $payload['password_confirmation'] ?? ''
            );

            $code = ($result['status'] === 'success') ? 200 : 422;
            sendJsonResponse($result['status'], $result['message'], null, $code);
            break;

        case 'student_reset_password':
            if ($method !== 'POST') {
                throw new Exception('Method not supported.');
            }

            $result = $auth->studentResetPassword(
                $payload['student_id'] ?? '',
                $payload['parent_email'] ?? '',
                $payload['password'] ?? '',
                $payload['password_confirmation'] ?? ''
            );

            $code = ($result['status'] === 'success') ? 200 : 422;
            sendJsonResponse($result['status'], $result['message'], null, $code);
            break;

        case 'current_teacher':
        case 'teacher_dashboard':
            if ($method !== 'GET') {
                throw new Exception('Method not supported.');
            }

            $result = $auth->currentTeacher();
            $code = ($result['status'] === 'success') ? 200 : 401;
            sendJsonResponse($result['status'], $result['status'] === 'success' ? 'Teacher fetched.' : $result['message'], ['teacher' => $result['teacher'] ?? null], $code);
            break;

        case 'current_student':
        case 'student_dashboard':
            if ($method !== 'GET') {
                throw new Exception('Method not supported.');
            }

            $result = $auth->currentStudent();
            $code = ($result['status'] === 'success') ? 200 : 401;
            sendJsonResponse($result['status'], $result['status'] === 'success' ? 'Student fetched.' : $result['message'], ['student' => $result['student'] ?? null], $code);
            break;

        case 'check':
            if ($method !== 'GET') {
                throw new Exception('Method not supported.');
            }

            sendJsonResponse('success', 'Session status fetched.', [
                'isTeacherLoggedIn' => $auth->isTeacherLoggedIn(),
                'isStudentLoggedIn' => $auth->isStudentLoggedIn(),
            ]);
            break;

        case 'logout':
        case 'teacher_logout':
        case 'student_logout':
            if ($method !== 'POST') {
                throw new Exception('Method not supported.');
            }

            $result = $auth->logout();
            sendJsonResponse($result['status'], $result['message']);
            break;

        default:
            throw new Exception('Invalid action.');
    }
} catch (Exception $e) {
    sendJsonResponse('error', $e->getMessage(), null, 500);
}
