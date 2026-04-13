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

header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, X-Client-Time');
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

try {
    require_once '../class/Database.php';
    require_once '../class/Auth.php';
    require_once '../class/Attendance.php';

    $database = new Database();
    $db = $database->connect();

    $auth = new Auth($db);
    $attendance = new Attendance($db);

    $method = $_SERVER['REQUEST_METHOD'];
    if ($method === 'POST' && isset($_POST['_method'])) {
        $override = strtoupper((string)$_POST['_method']);
        if (in_array($override, ['PUT', 'DELETE'], true)) {
            $method = $override;
        }
    }

    $action = $_GET['action'] ?? '';
    if ($action === '') {
        throw new Exception('Action is required.');
    }

    $jsonBody = getJsonBody();
    $payload = array_merge($jsonBody, $_POST);

    if ($action === 'scan_qr') {
        if ($method !== 'POST') {
            sendJsonResponse('error', 'Method not supported.', null, 405);
        }

        $clientTime = $_SERVER['HTTP_X_CLIENT_TIME'] ?? null;

        $result = $attendance->scanQr($payload, [
            'ip_address'  => $_SERVER['REMOTE_ADDR'] ?? null,
            'user_agent'  => $_SERVER['HTTP_USER_AGENT'] ?? null,
            'client_time' => $clientTime,
        ]);

        if ($result['status'] === 'success') {
            $code = 200;
        } elseif (($result['already_marked'] ?? false) || ($result['session_ended'] ?? false)) {
            $code = 400;
        } elseif ($result['unauthorized'] ?? false) {
            $code = 401;
        } else {
            $code = 422;
        }

        sendJsonResponse($result['status'], $result['message'], [
            'attendance_record_id' => $result['attendance_record_id'] ?? null,
            'already_marked'       => $result['already_marked'] ?? null,
            'notifications_created' => $result['notifications_created'] ?? 0,
            'student'              => $result['student'] ?? null,
            'class'                => $result['class'] ?? null,
            'record'               => $result['record'] ?? null,
        ], $code);
    }

    if ($action === 'student_history') {
        if ($method !== 'GET') {
            sendJsonResponse('error', 'Method not supported.', null, 405);
        }

        if (!$auth->isStudentLoggedIn()) {
            sendJsonResponse('error', 'Unauthorized', null, 401);
        }

        $studentPkId = $auth->getStudentSessionId();
        $historyQuery = "SELECT ar.id, ar.status, ar.checked_in_at,
                                DATE_FORMAT(COALESCE(ar.checked_in_at, ar.created_at), '%M %d, %Y %h:%i %p') AS checked_in_at_formatted,
                                COALESCE(
                                    NULLIF(c.class_name, ''),
                                    CASE
                                        WHEN c.class_code <> '' AND c.subject_name <> ''
                                            THEN CONCAT(c.class_code, ' - ', c.subject_name)
                                        WHEN c.subject_name <> '' THEN c.subject_name
                                        WHEN c.class_code  <> '' THEN c.class_code
                                        ELSE 'Unknown Class'
                                    END
                                ) AS class_name,
                                c.subject_name,
                                c.class_code,
                                CONCAT(t.first_name, ' ', t.last_name) AS teacher_name
                         FROM attendance_records ar
                         INNER JOIN attendance_sessions s ON s.id = ar.attendance_session_id
                         INNER JOIN teacher_classes c ON c.id = s.teacher_class_id
                         INNER JOIN teachers t ON t.id = c.teacher_id
                         WHERE ar.student_id = :student_id
                         ORDER BY COALESCE(ar.checked_in_at, ar.created_at) DESC";
        $historyStmt = $db->prepare($historyQuery);
        $historyStmt->execute([':student_id' => $studentPkId]);
        sendJsonResponse('success', 'History fetched.', ['records' => $historyStmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    if ($action === 'student_analytics') {
        if ($method !== 'GET') {
            sendJsonResponse('error', 'Method not supported.', null, 405);
        }

        if (!$auth->isStudentLoggedIn()) {
            sendJsonResponse('error', 'Unauthorized', null, 401);
        }

        $studentPkId = $auth->getStudentSessionId();
        $result = $attendance->getStudentAnalytics($studentPkId);
        $code = ($result['status'] === 'success') ? 200 : 422;
        sendJsonResponse($result['status'], $result['status'] === 'success' ? 'Analytics fetched.' : $result['message'], $result['data'] ?? null, $code);
    }

    if (!$auth->isTeacherLoggedIn()) {
        sendJsonResponse('error', 'Unauthorized', null, 401);
    }

    $teacherId = $auth->getTeacherSessionId();

    switch ($action) {
        case 'create_session':
            if ($method !== 'POST') {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $mergedPayload = array_merge(['class_id' => $_GET['class_id'] ?? null], $payload);
            $result = $attendance->createSession($teacherId, $mergedPayload);
            $code = ($result['status'] === 'success') ? 201 : 422;
            sendJsonResponse($result['status'], $result['message'], [
                'session_id' => $result['session_id'] ?? null,
                'session' => $result['session'] ?? null,
                'qr_token' => $result['qr_token'] ?? null,
                'server_time' => $result['server_time'] ?? date('Y-m-d\TH:i:s'),
            ], $code);
            break;

        case 'list_sessions':
            if ($method !== 'GET') {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $classId = isset($_GET['class_id']) ? (int)$_GET['class_id'] : (isset($_GET['teacher_class_id']) ? (int)$_GET['teacher_class_id'] : null);
            $result = $attendance->listSessionsByTeacher($teacherId, $classId);
            sendJsonResponse($result['status'], 'Sessions fetched.', ['sessions' => $result['sessions']]);
            break;

        case 'session_records':
            if ($method !== 'GET') {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $sessionId = isset($_GET['session_id']) ? (int)$_GET['session_id'] : 0;
            if ($sessionId <= 0) {
                sendJsonResponse('error', 'session_id is required.', null, 422);
            }

            $result = $attendance->getSessionRecords($sessionId, $teacherId);
            $code = ($result['status'] === 'success') ? 200 : 422;
            sendJsonResponse($result['status'], $result['status'] === 'success' ? 'Session records fetched.' : $result['message'], [
                'session' => $result['session'] ?? null,
                'records' => $result['records'] ?? [],
            ], $code);
            break;

        case 'live':
            if ($method !== 'GET') {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $sessionId = isset($_GET['session_id']) ? (int)$_GET['session_id'] : 0;
            if ($sessionId <= 0) {
                sendJsonResponse('error', 'session_id is required.', null, 422);
            }

            $recordsResult = $attendance->getSessionRecords($sessionId, $teacherId);
            if ($recordsResult['status'] !== 'success') {
                sendJsonResponse($recordsResult['status'], $recordsResult['message'] ?? 'Unable to fetch live attendance data.', null, 422);
            }

            $summaryResult = $attendance->getSessionSummary($sessionId, $teacherId);
            $summary = $summaryResult['summary'] ?? [];

            $present = (int)($summary['present'] ?? 0);
            $late = (int)($summary['late'] ?? 0);
            $absent = (int)($summary['absent'] ?? 0);
            $total = (int)($summary['total_enrolled'] ?? ($present + $late + $absent));

            sendJsonResponse('success', 'Live attendance fetched.', [
                'session' => $recordsResult['session'] ?? null,
                'records' => $recordsResult['records'] ?? [],
                'stats' => [
                    'total' => $total,
                    'present' => $present,
                    'late' => $late,
                    'absent' => $absent,
                ],
                'server_time' => date('Y-m-d\TH:i:s'),
            ]);
            break;

        case 'session_summary':
            if ($method !== 'GET') {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $sessionId = isset($_GET['session_id']) ? (int)$_GET['session_id'] : 0;
            if ($sessionId <= 0) {
                sendJsonResponse('error', 'session_id is required.', null, 422);
            }

            $result = $attendance->getSessionSummary($sessionId, $teacherId);
            $code = ($result['status'] === 'success') ? 200 : 422;
            sendJsonResponse($result['status'], $result['status'] === 'success' ? 'Session summary fetched.' : $result['message'], [
                'summary' => $result['summary'] ?? null,
            ], $code);
            break;

        case 'close_session':
            if (!in_array($method, ['POST', 'PUT'], true)) {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $sessionId = (int)($payload['session_id'] ?? $_GET['session_id'] ?? 0);
            if ($sessionId <= 0) {
                sendJsonResponse('error', 'session_id is required.', null, 422);
            }

            $result = $attendance->closeSession($sessionId, $teacherId);
            $code = ($result['status'] === 'success') ? 200 : 422;
            sendJsonResponse($result['status'], $result['message'], [
                'absent_count' => $result['absent_count'] ?? 0,
            ], $code);
            break;

        case 'manual_mark':
            if ($method !== 'POST') {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $sessionId = (int)($payload['session_id'] ?? 0);
            if ($sessionId <= 0) {
                sendJsonResponse('error', 'session_id is required.', null, 422);
            }

            $result = $attendance->manualMark($sessionId, $teacherId, $payload);
            $code = ($result['status'] === 'success') ? 200 : 422;
            sendJsonResponse($result['status'], $result['message'], [
                'attendance_record_id' => $result['attendance_record_id'] ?? null,
                'notifications_created' => $result['notifications_created'] ?? 0,
            ], $code);
            break;

        case 'dashboard':
            if ($method !== 'GET') {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $classes = $attendance->getClassesWithTodayStats($teacherId);
            sendJsonResponse('success', 'Dashboard data fetched.', $classes);
            break;

        case 'teacher_analytics':
            if ($method !== 'GET') {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $classId = isset($_GET['class_id']) ? (int)$_GET['class_id'] : 0;
            if ($classId <= 0) {
                sendJsonResponse('error', 'class_id is required.', null, 422);
            }

            $result = $attendance->getTeacherAnalytics($teacherId, $classId);
            $code = ($result['status'] === 'success') ? 200 : 422;
            sendJsonResponse($result['status'], $result['status'] === 'success' ? 'Analytics fetched.' : $result['message'], $result['data'] ?? null, $code);
            break;

        case 'reports':
            if ($method !== 'GET') {
                sendJsonResponse('error', 'Method not supported.', null, 405);
            }

            $filters = [
                'class_id' => $_GET['class_id'] ?? null,
                'date' => $_GET['date'] ?? null,
            ];

            $result = $attendance->getTeacherReports($teacherId, $filters);
            $code = ($result['status'] === 'success') ? 200 : 422;

            sendJsonResponse($result['status'], $result['status'] === 'success' ? 'Reports fetched.' : ($result['message'] ?? 'Unable to fetch reports.'), [
                'records' => $result['records'] ?? [],
                'classes' => $result['classes'] ?? [],
                'filters' => [
                    'class_id' => $filters['class_id'] ?? '',
                    'date' => $filters['date'] ?? '',
                ],
            ], $code);
            break;

        default:
            sendJsonResponse('error', 'Invalid action.', null, 400);
    }
} catch (Exception $e) {
    sendJsonResponse('error', $e->getMessage(), null, 500);
}
