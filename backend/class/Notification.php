<?php

class Notification
{
    private $conn;
    private $table = 'notification_logs';

    public function __construct($db)
    {
        $this->conn = $db;
    }

    public function listAll($filters = [])
    {
        $where = [];
        $params = [];

        if (!empty($filters['user_type'])) {
            $where[] = 'user_type = :user_type';
            $params[':user_type'] = trim((string)$filters['user_type']);
        }

        if (!empty($filters['user_id'])) {
            $where[] = 'user_id = :user_id';
            $params[':user_id'] = (int)$filters['user_id'];
        }

        if (!empty($filters['status'])) {
            $where[] = 'status = :status';
            $params[':status'] = trim((string)$filters['status']);
        }

        if (!empty($filters['type'])) {
            $where[] = 'type = :type';
            $params[':type'] = trim((string)$filters['type']);
        }

        if (!empty($filters['unread'])) {
            $where[] = 'read_at IS NULL';
        }

        $whereSql = '';
        if (!empty($where)) {
            $whereSql = ' WHERE ' . implode(' AND ', $where);
        }

        // Fetch notifications filtered by user_type, user_id, status, type, or unread flag — all filters are optional and combined with AND
        $query = "SELECT id, user_type, user_id, type, title, message, metadata, status, read_at, created_at, updated_at
                  FROM {$this->table}
                  {$whereSql}
                  ORDER BY id DESC";

        $stmt = $this->conn->prepare($query);
        $stmt->execute($params);

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as &$row) {
            if (!empty($row['metadata'])) {
                $decoded = json_decode((string)$row['metadata'], true);
                $row['metadata'] = is_array($decoded) ? $decoded : $row['metadata'];
            }
        }
        unset($row);

        return [
            'status' => 'success',
            'notifications' => $rows
        ];
    }

    public function create($data)
    {
        $userType = strtolower(trim((string)($data['user_type'] ?? '')));
        $userId = (int)($data['user_id'] ?? 0);
        $type = trim((string)($data['type'] ?? 'attendance'));
        $title = trim((string)($data['title'] ?? 'Notification'));
        $message = trim((string)($data['message'] ?? ''));
        $status = strtolower(trim((string)($data['status'] ?? 'success')));

        $allowedUserTypes = ['teacher', 'student'];
        $allowedStatus = ['success', 'failed', 'pending'];

        if (!in_array($userType, $allowedUserTypes, true) || $userId <= 0 || $message === '') {
            return [
                'status' => 'error',
                'message' => 'Valid user_type, user_id, and message are required.'
            ];
        }

        if (!in_array($status, $allowedStatus, true)) {
            $status = 'success';
        }

        $metadata = null;
        if (isset($data['metadata'])) {
            if (is_array($data['metadata'])) {
                $metadata = json_encode($data['metadata'], JSON_UNESCAPED_SLASHES);
            } else {
                $rawMetadata = trim((string)$data['metadata']);
                if ($rawMetadata !== '') {
                    $decoded = json_decode($rawMetadata, true);
                    if (json_last_error() === JSON_ERROR_NONE) {
                        $metadata = $rawMetadata;
                    } else {
                        $metadata = json_encode(['value' => $rawMetadata], JSON_UNESCAPED_SLASHES);
                    }
                }
            }
        }

        // Insert a new notification record for a teacher or student
        $query = "INSERT INTO {$this->table}
                    (user_type, user_id, type, title, message, metadata, status, read_at, created_at, updated_at)
                  VALUES
                    (:user_type, :user_id, :type, :title, :message, :metadata, :status, NULL, NOW(), NOW())";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':user_type' => $userType,
            ':user_id' => $userId,
            ':type' => $type,
            ':title' => $title !== '' ? $title : 'Notification',
            ':message' => $message,
            ':metadata' => $metadata,
            ':status' => $status,
        ]);

        return [
            'status' => 'success',
            'message' => 'Notification created successfully.',
            'notification_id' => (int)$this->conn->lastInsertId()
        ];
    }

    private function findOwnedNotification($notificationId, $userType, $userId)
    {
        $query = "SELECT id, status FROM {$this->table}
                  WHERE id = :id AND user_type = :user_type AND user_id = :user_id
                  LIMIT 1";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':id' => (int)$notificationId,
            ':user_type' => trim((string)$userType),
            ':user_id' => (int)$userId,
        ]);

        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public function updateStatusForUser($notificationId, $status, $userType, $userId)
    {
        $notificationId = (int)$notificationId;
        $status = strtolower(trim((string)$status));
        $userType = trim((string)$userType);
        $userId = (int)$userId;

        $allowed = ['success', 'failed', 'pending'];
        if ($notificationId <= 0 || $userType === '' || $userId <= 0 || !in_array($status, $allowed, true)) {
            return [
                'status' => 'error',
                'message' => 'Valid notification ID and status are required.',
                'httpCode' => 422,
            ];
        }

        $owned = $this->findOwnedNotification($notificationId, $userType, $userId);
        if (!$owned) {
            return [
                'status' => 'error',
                'message' => 'Forbidden',
                'httpCode' => 403,
            ];
        }

        if (strtolower((string)($owned['status'] ?? '')) === $status) {
            return [
                'status' => 'error',
                'message' => 'Notification not found or unchanged.',
                'httpCode' => 422,
            ];
        }

        $query = "UPDATE {$this->table}
                  SET status = :status, updated_at = NOW()
                  WHERE id = :id AND user_type = :user_type AND user_id = :user_id";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':status' => $status,
            ':id' => $notificationId,
            ':user_type' => $userType,
            ':user_id' => $userId,
        ]);

        return [
            'status' => 'success',
            'message' => 'Notification status updated successfully.'
        ];
    }

    public function updateStatus($notificationId, $status)
    {
        $notificationId = (int)$notificationId;
        $status = strtolower(trim((string)$status));
        $allowed = ['success', 'failed', 'pending'];

        if ($notificationId <= 0 || !in_array($status, $allowed, true)) {
            return [
                'status' => 'error',
                'message' => 'Valid notification ID and status are required.'
            ];
        }

        // Update the status field of a notification by its ID
        $query = "UPDATE {$this->table}
                  SET status = :status, updated_at = NOW()
                  WHERE id = :id";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':status' => $status,
            ':id' => $notificationId,
        ]);

        if ($stmt->rowCount() === 0) {
            return [
                'status' => 'error',
                'message' => 'Notification not found or unchanged.'
            ];
        }

        return [
            'status' => 'success',
            'message' => 'Notification status updated successfully.'
        ];
    }

    public function markRead($notificationId, $userType = null, $userId = null)
    {
        $notificationId = (int)$notificationId;
        if ($notificationId <= 0) {
            return [
                'status' => 'error',
                'message' => 'Invalid notification ID.'
            ];
        }

        $whereUser = '';
        $params = [':id' => $notificationId];

        if ($userType !== null && $userId !== null) {
            $whereUser = ' AND user_type = :user_type AND user_id = :user_id';
            $params[':user_type'] = $userType;
            $params[':user_id'] = (int)$userId;
        }

        // Mark a single notification as read — user_type and user_id are checked to ensure ownership
        $query = "UPDATE {$this->table}
                  SET read_at = NOW(), updated_at = NOW()
                  WHERE id = :id {$whereUser}";

        $stmt = $this->conn->prepare($query);
        $stmt->execute($params);

        if ($stmt->rowCount() === 0) {
            return [
                'status' => 'error',
                'message' => 'Notification not found or already read.'
            ];
        }

        return [
            'status' => 'success',
            'message' => 'Notification marked as read.'
        ];
    }

    public function markAllRead($userType, $userId)
    {
        $userType = trim((string)$userType);
        $userId = (int)$userId;

        if ($userType === '' || $userId <= 0) {
            return [
                'status' => 'error',
                'message' => 'Valid user_type and user_id are required.'
            ];
        }

        // Mark all unread notifications as read for this specific user
        $query = "UPDATE {$this->table}
                  SET read_at = NOW(), updated_at = NOW()
                  WHERE user_type = :user_type AND user_id = :user_id AND read_at IS NULL";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':user_type' => $userType,
            ':user_id' => $userId,
        ]);

        return [
            'status' => 'success',
            'message' => 'All notifications marked as read.',
            'updated' => $stmt->rowCount(),
        ];
    }

    public function deleteForUser($notificationId, $userType, $userId)
    {
        $notificationId = (int)$notificationId;
        $userType = trim((string)$userType);
        $userId = (int)$userId;

        if ($notificationId <= 0 || $userType === '' || $userId <= 0) {
            return [
                'status' => 'error',
                'message' => 'Invalid notification ID.',
                'httpCode' => 422,
            ];
        }

        $owned = $this->findOwnedNotification($notificationId, $userType, $userId);
        if (!$owned) {
            return [
                'status' => 'error',
                'message' => 'Forbidden',
                'httpCode' => 403,
            ];
        }

        $query = "DELETE FROM {$this->table}
                  WHERE id = :id AND user_type = :user_type AND user_id = :user_id";

        $stmt = $this->conn->prepare($query);
        $stmt->execute([
            ':id' => $notificationId,
            ':user_type' => $userType,
            ':user_id' => $userId,
        ]);

        return [
            'status' => 'success',
            'message' => 'Notification deleted successfully.'
        ];
    }

    public function delete($notificationId)
    {
        $notificationId = (int)$notificationId;
        if ($notificationId <= 0) {
            return [
                'status' => 'error',
                'message' => 'Invalid notification ID.'
            ];
        }

        // Delete a single notification by its ID
        $query = "DELETE FROM {$this->table} WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $stmt->execute([':id' => $notificationId]);

        if ($stmt->rowCount() === 0) {
            return [
                'status' => 'error',
                'message' => 'Notification not found.'
            ];
        }

        return [
            'status' => 'success',
            'message' => 'Notification deleted successfully.'
        ];
    }
}
