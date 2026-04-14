<?php

class Message
{
    private $conn;
    private $table = 'messages';

    public function __construct($db)
    {
        $this->conn = $db;
    }

    public function getConversation($params)
    {
        $senderType   = $params['sender_type'] ?? '';
        $senderId     = (int)($params['sender_id'] ?? 0);
        $receiverType = $params['receiver_type'] ?? '';
        $receiverId   = (int)($params['receiver_id'] ?? 0);
        $limit        = min((int)($params['limit'] ?? 50), 100);
        $beforeId     = (int)($params['before_id'] ?? 0);

        if (!$senderType || !$senderId || !$receiverType || !$receiverId) {
            return [
                'status' => 'error',
                'message' => 'sender_type, sender_id, receiver_type, receiver_id are required.',
                'httpCode' => 422,
            ];
        }

        $sql = "SELECT id, sender_type, sender_id, receiver_type, receiver_id,
                       class_id, message, attachment_url, attachment_type, attachment_name, is_read, created_at
                FROM {$this->table}
                WHERE (
                    (sender_type = :st1 AND sender_id = :si1 AND receiver_type = :rt1 AND receiver_id = :ri1)
                    OR
                    (sender_type = :st2 AND sender_id = :si2 AND receiver_type = :rt2 AND receiver_id = :ri2)
                )";

        $params = [
            ':st1' => $senderType,   ':si1' => $senderId,
            ':rt1' => $receiverType, ':ri1' => $receiverId,
            ':st2' => $receiverType, ':si2' => $receiverId,
            ':rt2' => $senderType,   ':ri2' => $senderId,
        ];

        if ($beforeId > 0) {
            $sql .= " AND id < :before_id";
            $params[':before_id'] = $beforeId;
        }

        $sql .= " ORDER BY created_at DESC LIMIT :lim";

        $stmt = $this->conn->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return [
            'status' => 'success',
            'message' => 'Conversation fetched.',
            'messages' => array_reverse($stmt->fetchAll()),
        ];
    }

    public function getInbox($params)
    {
        $userType = $params['user_type'] ?? '';
        $userId   = (int)($params['user_id'] ?? 0);

        if (!$userType || !$userId) {
            return [
                'status' => 'error',
                'message' => 'user_type and user_id are required.',
                'httpCode' => 422,
            ];
        }

        $sql = "
            SELECT
                base.*,
                (
                    SELECT COUNT(*) FROM {$this->table} sub
                    WHERE sub.receiver_type = :ut2
                      AND sub.receiver_id   = :ui2
                      AND sub.sender_type   = base.partner_type
                      AND sub.sender_id     = base.partner_id
                      AND sub.is_read = 0
                ) AS unread_count
            FROM (
                SELECT
                    m.id,
                    m.sender_type, m.sender_id,
                    m.receiver_type, m.receiver_id,
                    m.message, m.is_read, m.created_at,
                    CASE
                        WHEN m.sender_type = :ut3 AND m.sender_id = :ui3
                            THEN m.receiver_type
                        ELSE m.sender_type
                    END AS partner_type,
                    CASE
                        WHEN m.sender_type = :ut4 AND m.sender_id = :ui4
                            THEN m.receiver_id
                        ELSE m.sender_id
                    END AS partner_id
                FROM {$this->table} m
                INNER JOIN (
                    SELECT MAX(id) AS max_id
                    FROM {$this->table}
                    WHERE (sender_type = :ut5 AND sender_id = :ui5)
                       OR (receiver_type = :ut6 AND receiver_id = :ui6)
                    GROUP BY
                        LEAST(CONCAT(sender_type,'_',sender_id), CONCAT(receiver_type,'_',receiver_id)),
                        GREATEST(CONCAT(sender_type,'_',sender_id), CONCAT(receiver_type,'_',receiver_id))
                ) latest ON m.id = latest.max_id
            ) base
            ORDER BY base.created_at DESC
        ";

        $stmt = $this->conn->prepare($sql);
        $stmt->bindValue(':ut2', $userType);
        $stmt->bindValue(':ui2', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':ut3', $userType);
        $stmt->bindValue(':ui3', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':ut4', $userType);
        $stmt->bindValue(':ui4', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':ut5', $userType);
        $stmt->bindValue(':ui5', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':ut6', $userType);
        $stmt->bindValue(':ui6', $userId, PDO::PARAM_INT);
        $stmt->execute();

        $threads = $stmt->fetchAll();

        foreach ($threads as &$thread) {
            $partnerType = $thread['partner_type'];
            $partnerId = (int)$thread['partner_id'];

            if ($partnerType === 'teacher') {
                $nameStmt = $this->conn->prepare("SELECT first_name, last_name FROM teachers WHERE id = ?");
            } else {
                $nameStmt = $this->conn->prepare("SELECT first_name, last_name, student_id FROM students WHERE id = ?");
            }

            $nameStmt->execute([$partnerId]);
            $info = $nameStmt->fetch();

            $thread['partner_name'] = $info
                ? trim(($info['first_name'] ?? '') . ' ' . ($info['last_name'] ?? ''))
                : 'Unknown';

            if (isset($info['student_id'])) {
                $thread['partner_student_id'] = $info['student_id'];
            }
        }
        unset($thread);

        return [
            'status' => 'success',
            'message' => 'Inbox fetched.',
            'threads' => $threads,
        ];
    }

    public function markRead($payload)
    {
        $readerType = $payload['reader_type'] ?? '';
        $readerId   = (int)($payload['reader_id'] ?? 0);
        $senderType = $payload['sender_type'] ?? '';
        $senderId   = (int)($payload['sender_id'] ?? 0);

        if (!$readerType || !$readerId || !$senderType || !$senderId) {
            return [
                'status' => 'error',
                'message' => 'reader_type, reader_id, sender_type, sender_id are required.',
                'httpCode' => 422,
            ];
        }

        $stmt = $this->conn->prepare(
            "UPDATE {$this->table}
             SET is_read = 1, updated_at = NOW()
             WHERE receiver_type = :rt AND receiver_id = :ri
               AND sender_type   = :st AND sender_id   = :si
               AND is_read = 0"
        );
        $stmt->execute([
            ':rt' => $readerType, ':ri' => $readerId,
            ':st' => $senderType, ':si' => $senderId,
        ]);

        return [
            'status' => 'success',
            'message' => 'Messages marked as read.',
            'updated' => $stmt->rowCount(),
        ];
    }

    public function getUnreadCount($params)
    {
        $userType = $params['user_type'] ?? '';
        $userId   = (int)($params['user_id'] ?? 0);

        if (!$userType || !$userId) {
            return [
                'status' => 'error',
                'message' => 'user_type and user_id are required.',
                'httpCode' => 422,
            ];
        }

        $stmt = $this->conn->prepare(
            "SELECT COUNT(*) AS total FROM {$this->table}
             WHERE receiver_type = :ut AND receiver_id = :ui AND is_read = 0"
        );
        $stmt->execute([':ut' => $userType, ':ui' => $userId]);
        $row = $stmt->fetch();

        return [
            'status' => 'success',
            'message' => 'Unread count fetched.',
            'unread' => (int)($row['total'] ?? 0),
        ];
    }

    public function uploadAttachment($file, $server)
    {
        if (empty($file)) {
            return [
                'status' => 'error',
                'message' => 'No file uploaded.',
                'httpCode' => 422,
            ];
        }

        $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
        if ($error !== UPLOAD_ERR_OK) {
            return [
                'status' => 'error',
                'message' => 'Upload error code: ' . $error,
                'httpCode' => 422,
            ];
        }

        $allowedMime = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain',
        ];

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);

        if (!in_array($mimeType, $allowedMime, true)) {
            return [
                'status' => 'error',
                'message' => 'File type not allowed: ' . $mimeType,
                'httpCode' => 422,
            ];
        }

        if (($file['size'] ?? 0) > 10 * 1024 * 1024) {
            return [
                'status' => 'error',
                'message' => 'File too large (max 10 MB).',
                'httpCode' => 422,
            ];
        }

        $publicRoot = realpath(__DIR__ . '/../../public');
        if ($publicRoot === false) {
            return [
                'status' => 'error',
                'message' => 'Upload directory root not found.',
                'httpCode' => 500,
            ];
        }

        $uploadDir = $publicRoot . DIRECTORY_SEPARATOR
                   . 'uploads' . DIRECTORY_SEPARATOR . 'messages' . DIRECTORY_SEPARATOR;

        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $ext         = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $safeName    = preg_replace('/[^a-zA-Z0-9._-]/', '_', basename($file['name']));
        $uniqueName  = time() . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
        $destination = $uploadDir . $uniqueName;

        if (!move_uploaded_file($file['tmp_name'], $destination)) {
            return [
                'status' => 'error',
                'message' => 'Failed to save file.',
                'httpCode' => 500,
            ];
        }

        if (str_starts_with($mimeType, 'image/')) {
            $attachType = 'image';
        } elseif ($mimeType === 'application/pdf') {
            $attachType = 'pdf';
        } else {
            $attachType = 'file';
        }

        $scheme   = (!empty($server['HTTPS']) && $server['HTTPS'] !== 'off') ? 'https' : 'http';
        $host     = $server['HTTP_HOST'] ?? 'localhost';
        $docRootPath = realpath($server['DOCUMENT_ROOT'] ?? '') ?: '';
        $docRoot  = rtrim(str_replace('\\', '/', $docRootPath), '/');
        $fileFull = str_replace('\\', '/', realpath($destination));

        $relPath = $docRoot !== ''
            ? substr($fileFull, strlen($docRoot))
            : '/' . ltrim(str_replace('\\', '/', $destination), '/');

        $encoded  = implode('/', array_map('rawurlencode', explode('/', trim($relPath, '/'))));
        $publicPath = $scheme . '://' . $host . '/' . $encoded;

        return [
            'status' => 'success',
            'message' => 'File uploaded.',
            'attachment_url' => $publicPath,
            'attachment_type' => $attachType,
            'attachment_name' => $safeName,
        ];
    }
}