<?php
// ============================================================
//  messages_api.php  — REST fallback for messaging
//  Handles: fetch conversation history, mark messages as read
//  Real-time sending is done via the Socket.io server (port 3000)
//  but the Node server also calls this endpoint's DB logic
//  by hitting MySQL directly — so this file is for the React
//  initial load only.
// ============================================================

ini_set('display_errors', 0);
error_reporting(E_ALL);

require_once '../class/SessionConfig.php';

require_once 'cors.php';
header('Content-Type: application/json');

// ── Helpers ───────────────────────────────────────────────────
function sendJsonResponse($status, $message, $data = null, $httpCode = 200)
{
    http_response_code($httpCode);
    $response = ['status' => $status, 'message' => $message];
    if ($data !== null) {
        $response = array_merge($response, $data);
    }
    echo json_encode($response);
    exit;
}

function getJsonBody()
{
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function extractResponseData($result)
{
    $data = $result;
    unset($data['status'], $data['message'], $data['httpCode']);
    return empty($data) ? null : $data;
}

// ── Main ──────────────────────────────────────────────────────
try {
    require_once '../class/Database.php';
    require_once '../class/Message.php';

    $db             = (new Database())->connect();
    $messageService = new Message($db);
    $method         = $_SERVER['REQUEST_METHOD'];
    $action         = $_GET['action'] ?? '';

    $body    = getJsonBody();
    $payload = array_merge($body, $_POST);

    if ($action === '') {
        throw new Exception('Action is required.');
    }

    switch ($action) {

        // ── GET /messages_api.php?action=conversation ─────────
        // Fetch paginated conversation between two users.
        // Required GET params:
        //   sender_type, sender_id, receiver_type, receiver_id
        //   Optional: limit (default 50), before_id (for pagination)
        case 'conversation':
            if ($method !== 'GET') throw new Exception('Method not supported.');

            $result = $messageService->getConversation($_GET);
            sendJsonResponse(
                $result['status'],
                $result['message'],
                extractResponseData($result),
                $result['httpCode'] ?? 200
            );
            break;

        // ── GET /messages_api.php?action=inbox ────────────────
        // Returns the unique list of conversation partners for a user.
        // Required GET params: user_type, user_id
        case 'inbox':
            if ($method !== 'GET') throw new Exception('Method not supported.');

            $result = $messageService->getInbox($_GET);
            sendJsonResponse(
                $result['status'],
                $result['message'],
                extractResponseData($result),
                $result['httpCode'] ?? 200
            );
            break;

        // ── POST /messages_api.php?action=mark_read ───────────
        // Mark all messages in a conversation as read.
        // Body: reader_type, reader_id, sender_type, sender_id
        case 'mark_read':
            if ($method !== 'POST') throw new Exception('Method not supported.');

            $result = $messageService->markRead($payload);
            sendJsonResponse(
                $result['status'],
                $result['message'],
                extractResponseData($result),
                $result['httpCode'] ?? 200
            );
            break;

        // ── POST /messages_api.php?action=send_message ────────
        // Send a message with optional reply_to_id.
        case 'send_message':
            if ($method !== 'POST') throw new Exception('Method not supported.');

            $result = $messageService->createMessage($payload);
            sendJsonResponse(
                $result['status'],
                $result['message'],
                extractResponseData($result),
                $result['httpCode'] ?? 200
            );
            break;

        // ── POST /messages_api.php?action=delete_conversation ─
        // Delete conversation for current user only (your side).
        case 'delete_conversation':
            if ($method !== 'POST') throw new Exception('Method not supported.');

            $result = $messageService->deleteConversation($payload);
            sendJsonResponse(
                $result['status'],
                $result['message'],
                extractResponseData($result),
                $result['httpCode'] ?? 200
            );
            break;

        // ── GET /messages_api.php?action=unread_count ─────────
        // Returns total unread message count for the nav badge.
        // Required GET params: user_type, user_id
        case 'unread_count':
            if ($method !== 'GET') throw new Exception('Method not supported.');

            $result = $messageService->getUnreadCount($_GET);
            sendJsonResponse(
                $result['status'],
                $result['message'],
                extractResponseData($result),
                $result['httpCode'] ?? 200
            );
            break;

        // ── POST /messages_api.php?action=upload_attachment ───
        // Accepts a multipart file upload, saves it to public/uploads/messages/
        // and returns the public URL + metadata.
        // Form fields: sender_type, sender_id (for basic auth check)
        case 'upload_attachment':
            if ($method !== 'POST') throw new Exception('Method not supported.');

            $result = $messageService->uploadAttachment($_FILES['file'] ?? null, $_SERVER);
            sendJsonResponse(
                $result['status'],
                $result['message'],
                extractResponseData($result),
                $result['httpCode'] ?? 200
            );
            break;

        default:
            throw new Exception('Invalid action.');
    }
} catch (Exception $e) {
    sendJsonResponse('error', $e->getMessage(), null, 500);
}
