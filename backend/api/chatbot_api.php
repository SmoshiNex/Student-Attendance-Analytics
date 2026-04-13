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
    require_once '../class/StudentChatbot.php';

    $database = new Database();
    $db = $database->connect();

    $auth = new Auth($db);
    $chatbot = new StudentChatbot($db);

    if (!$auth->isStudentLoggedIn()) {
        sendJsonResponse('error', 'Unauthorized', null, 401);
    }

    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

    $jsonBody = getJsonBody();
    $payload = array_merge($jsonBody, $_POST);

    if ($action === '') {
        throw new Exception('Action is required.');
    }

    switch ($action) {
        case 'student_chat':
            if ($method !== 'POST') {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $studentPkId = (int)$auth->getStudentSessionId();
            $message = (string)($payload['message'] ?? '');
            $history = $payload['history'] ?? [];
            if (!is_array($history)) {
                $history = [];
            }

            $result = $chatbot->chat($studentPkId, $message, $history);
            if ($result['status'] === 'success') {
                sendJsonResponse('success', 'Reply generated.', [
                    'reply' => $result['reply'] ?? '',
                ], 200);
            }

            $errorMessage = (string)($result['message'] ?? 'Unable to generate a response.');
            $httpCode = stripos($errorMessage, 'not configured') !== false ? 503 : 422;
            sendJsonResponse('error', $errorMessage, null, $httpCode);
            break;

        default:
            sendJsonResponse('error', 'Invalid action.', null, 400);
    }
} catch (Exception $e) {
    sendJsonResponse('error', $e->getMessage(), null, 500);
}
