<?php

ini_set('display_errors', 0);
error_reporting(E_ALL);

require_once '../class/SessionConfig.php';

header('Content-Type: application/json');

require_once 'cors.php';

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
    require_once '../class/Notification.php';

    $database = new Database();
    $db = $database->connect();

    $auth = new Auth($db);
    $notification = new Notification($db);

    $currentUserType = null;
    $currentUserId = null;

    if ($auth->isTeacherLoggedIn()) {
        $currentUserType = 'teacher';
        $currentUserId = $auth->getTeacherSessionId();
    } elseif ($auth->isStudentLoggedIn()) {
        $currentUserType = 'student';
        $currentUserId = $auth->getStudentSessionId();
    }

    if ($currentUserType === null || (int)$currentUserId <= 0) {
        sendJsonResponse('error', 'Unauthorized', null, 401);
    }

    $method = $_SERVER['REQUEST_METHOD'];
    if ($method === 'POST' && isset($_POST['_method'])) {
        $override = strtoupper((string)$_POST['_method']);
        if (in_array($override, ['PUT', 'PATCH', 'DELETE'], true)) {
            $method = $override;
        }
    }

    $action = $_GET['action'] ?? '';
    if ($action === '') {
        throw new Exception('Action is required.');
    }

    $jsonBody = getJsonBody();
    $payload = array_merge($jsonBody, $_POST);

    switch ($action) {
        case 'list':
            if ($method !== 'GET') {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $filters = [
                'user_type' => $currentUserType,
                'user_id' => $currentUserId,
                'status' => $_GET['status'] ?? null,
                'type' => $_GET['type'] ?? null,
                'unread' => isset($_GET['unread']) ? (int)$_GET['unread'] : 0,
            ];

            $result = $notification->listAll($filters);
            sendJsonResponse($result['status'], 'Notifications fetched.', ['notifications' => $result['notifications']]);
            break;

        case 'create':
            if ($method !== 'POST') {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $payload['user_type'] = $payload['user_type'] ?? $currentUserType;
            $payload['user_id'] = $payload['user_id'] ?? $currentUserId;

            // Users can only create notifications for themselves through this API.
            if ((string)$payload['user_type'] !== $currentUserType || (int)$payload['user_id'] !== (int)$currentUserId) {
                sendJsonResponse('error', 'Forbidden', null, 403);
            }

            $result = $notification->create($payload);
            $code = ($result['status'] === 'success') ? 201 : 422;
            sendJsonResponse($result['status'], $result['message'], ['notification_id' => $result['notification_id'] ?? null], $code);
            break;

        case 'update_status':
            if (!in_array($method, ['PUT', 'PATCH'], true)) {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $notificationId = (int)($payload['id'] ?? $_GET['id'] ?? 0);
            $status = $payload['status'] ?? '';
            if ($notificationId <= 0 || $status === '') {
                sendJsonResponse('error', 'id and status are required.', null, 422);
            }

            $result = $notification->updateStatusForUser($notificationId, $status, $currentUserType, $currentUserId);
            $code = $result['httpCode'] ?? (($result['status'] === 'success') ? 200 : 422);
            sendJsonResponse($result['status'], $result['message'], null, $code);
            break;

        case 'mark_read':
            if (!in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $notificationId = (int)($payload['id'] ?? $_GET['id'] ?? 0);
            if ($notificationId <= 0) {
                sendJsonResponse('error', 'id is required.', null, 422);
            }

            $result = $notification->markRead($notificationId, $currentUserType, $currentUserId);
            $code = ($result['status'] === 'success') ? 200 : 422;
            sendJsonResponse($result['status'], $result['message'], null, $code);
            break;

        case 'mark_all_read':
            if (!in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $result = $notification->markAllRead($currentUserType, $currentUserId);
            $code = ($result['status'] === 'success') ? 200 : 422;
            sendJsonResponse($result['status'], $result['message'], ['updated' => $result['updated'] ?? 0], $code);
            break;

        case 'delete':
            if ($method !== 'DELETE') {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $deletePayload = getDeletePayload();
            $notificationId = (int)($deletePayload['id'] ?? $_GET['id'] ?? 0);
            if ($notificationId <= 0) {
                sendJsonResponse('error', 'id is required.', null, 422);
            }

            $result = $notification->deleteForUser($notificationId, $currentUserType, $currentUserId);
            $code = $result['httpCode'] ?? (($result['status'] === 'success') ? 200 : 422);
            sendJsonResponse($result['status'], $result['message'], null, $code);
            break;

        default:
            sendJsonResponse('error', 'Invalid action.', null, 400);
    }
} catch (Exception $e) {
    sendJsonResponse('error', $e->getMessage(), null, 500);
}
