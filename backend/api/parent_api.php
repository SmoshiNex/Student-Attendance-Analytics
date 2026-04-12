<?php
ini_set('display_errors', 0);
error_reporting(E_ALL);

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

try {
    require_once '../class/Database.php';
    require_once '../class/Auth.php';

    $database = new Database();
    $db = $database->connect();

    $auth = new Auth($db);

    if (!$auth->isTeacherLoggedIn()) {
        sendJsonResponse('error', 'Unauthorized', null, 401);
    }

    sendJsonResponse(
        'error',
        'Parent management endpoints were removed to match Laravel backend design. Use students.parent_email and notification_api instead.',
        [
            'hint' => 'Update parent contact info through student records and use notification_logs for notifications.'
        ],
        410
    );
} catch (Exception $e) {
    sendJsonResponse('error', $e->getMessage(), null, 500);
}
