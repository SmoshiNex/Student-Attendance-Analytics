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
        $userKey      = $senderType . '_' . $senderId;

        if (!$senderType || !$senderId || !$receiverType || !$receiverId) {
            return [
                'status' => 'error',
                'message' => 'sender_type, sender_id, receiver_type, receiver_id are required.',
                'httpCode' => 422,
            ];
        }

        // Fetch conversation excluding messages deleted by this user
        // Also fetch reply_to_id and the replied message's content for quote display
        $sql = "SELECT m.id, m.sender_type, m.sender_id, m.receiver_type, m.receiver_id,
                       m.class_id, m.message, m.attachment_url, m.attachment_type, m.attachment_name,
                       m.is_read, m.created_at, m.reply_to_id,
                       rm.message AS reply_message,
                       rm.sender_type AS reply_sender_type,
                       rm.attachment_type AS reply_attachment_type,
                       rm.attachment_name AS reply_attachment_name
                FROM {$this->table} m
                LEFT JOIN {$this->table} rm ON rm.id = m.reply_to_id
                WHERE (
                    (m.sender_type = :st1 AND m.sender_id = :si1 AND m.receiver_type = :rt1 AND m.receiver_id = :ri1)
                    OR
                    (m.sender_type = :st2 AND m.sender_id = :si2 AND m.receiver_type = :rt2 AND m.receiver_id = :ri2)
                )
                AND (
                    m.deleted_for IS NULL
                    OR JSON_SEARCH(m.deleted_for, 'one', :user_key) IS NULL
                )";

        $queryParams = [
            ':st1' => $senderType,   ':si1' => $senderId,
            ':rt1' => $receiverType, ':ri1' => $receiverId,
            ':st2' => $receiverType, ':si2' => $receiverId,
            ':rt2' => $senderType,   ':ri2' => $senderId,
            ':user_key' => $userKey,
        ];

        if ($beforeId > 0) {
            $sql .= " AND m.id < :before_id";
            $queryParams[':before_id'] = $beforeId;
        }

        $sql .= " ORDER BY m.created_at DESC LIMIT :lim";

        $stmt = $this->conn->prepare($sql);
        foreach ($queryParams as $k => $v) {
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
                      AND (sub.deleted_for IS NULL OR JSON_SEARCH(sub.deleted_for, 'one', :ut2b) IS NULL)
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
                    WHERE ((sender_type = :ut5 AND sender_id = :ui5)
                       OR (receiver_type = :ut6 AND receiver_id = :ui6))
                      AND (deleted_for IS NULL OR JSON_SEARCH(deleted_for, 'one', :user_key) IS NULL)
                    GROUP BY
                        LEAST(CONCAT(sender_type,'_',sender_id), CONCAT(receiver_type,'_',receiver_id)),
                        GREATEST(CONCAT(sender_type,'_',sender_id), CONCAT(receiver_type,'_',receiver_id))
                ) latest ON m.id = latest.max_id
                WHERE (m.deleted_for IS NULL OR JSON_SEARCH(m.deleted_for, 'one', :user_key2) IS NULL)
            ) base
            ORDER BY base.created_at DESC
        ";

        $userKey = $userType . '_' . $userId;
        $stmt = $this->conn->prepare($sql);
        $stmt->bindValue(':ut2', $userType);
        $stmt->bindValue(':ui2', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':ut2b', $userKey);
        $stmt->bindValue(':ut3', $userType);
        $stmt->bindValue(':ui3', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':ut4', $userType);
        $stmt->bindValue(':ui4', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':ut5', $userType);
        $stmt->bindValue(':ui5', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':ut6', $userType);
        $stmt->bindValue(':ui6', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':user_key', $userKey);
        $stmt->bindValue(':user_key2', $userKey);
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

        // When behind a tunnel (Cloudflare/ngrok), use the forwarded host and scheme
        if (!empty($server['HTTP_X_FORWARDED_HOST'])) {
            $host = $server['HTTP_X_FORWARDED_HOST'];
        }
        if (!empty($server['HTTP_X_FORWARDED_PROTO'])) {
            $scheme = $server['HTTP_X_FORWARDED_PROTO'];
        } elseif (!empty($server['HTTP_CF_VISITOR'])) {
            $cfVisitor = json_decode($server['HTTP_CF_VISITOR'], true);
            if (!empty($cfVisitor['scheme'])) {
                $scheme = $cfVisitor['scheme'];
            }
        }
        $docRootPath = realpath($server['DOCUMENT_ROOT'] ?? '') ?: '';
        $docRoot  = rtrim(str_replace('\\', '/', $docRootPath), '/');
        $fileFull = str_replace('\\', '/', realpath($destination));

        $relPath = $docRoot !== ''
            ? substr($fileFull, strlen($docRoot))
            : '/' . ltrim(str_replace('\\', '/', $destination), '/');

        // Store as relative path so it works on any host (local IP, Cloudflare, ngrok)
        $publicPath = implode('/', array_map('rawurlencode', explode('/', trim($relPath, '/'))));
        $publicPath = '/' . $publicPath;

        return [
            'status' => 'success',
            'message' => 'File uploaded.',
            'attachment_url' => $publicPath,
            'attachment_type' => $attachType,
            'attachment_name' => $safeName,
        ];
    }

    public function deleteConversation($payload)
    {
        $userType    = trim((string)($payload['user_type'] ?? ''));
        $userId      = (int)($payload['user_id'] ?? 0);
        $partnerType = trim((string)($payload['partner_type'] ?? ''));
        $partnerId   = (int)($payload['partner_id'] ?? 0);

        if (!$userType || !$userId || !$partnerType || !$partnerId) {
            return ['status' => 'error', 'message' => 'user_type, user_id, partner_type, partner_id are required.', 'httpCode' => 422];
        }

        $userKey = $userType . '_' . $userId;

        // Fetch all messages in this conversation
        $fetchStmt = $this->conn->prepare(
            "SELECT id, deleted_for FROM {$this->table}
             WHERE (sender_type = :st1 AND sender_id = :si1 AND receiver_type = :rt1 AND receiver_id = :ri1)
                OR (sender_type = :st2 AND sender_id = :si2 AND receiver_type = :rt2 AND receiver_id = :ri2)"
        );
        $fetchStmt->execute([
            ':st1' => $userType,    ':si1' => $userId,
            ':rt1' => $partnerType, ':ri1' => $partnerId,
            ':st2' => $partnerType, ':si2' => $partnerId,
            ':rt2' => $userType,    ':ri2' => $userId,
        ]);
        $rows = $fetchStmt->fetchAll(PDO::FETCH_ASSOC);

        // Add userKey to deleted_for JSON array for each message
        $updateStmt = $this->conn->prepare(
            "UPDATE {$this->table} SET deleted_for = :deleted_for WHERE id = :id"
        );
        foreach ($rows as $row) {
            $deletedFor = [];
            if (!empty($row['deleted_for'])) {
                $decoded = json_decode($row['deleted_for'], true);
                if (is_array($decoded)) $deletedFor = $decoded;
            }
            if (!in_array($userKey, $deletedFor, true)) {
                $deletedFor[] = $userKey;
            }
            $updateStmt->execute([':deleted_for' => json_encode($deletedFor), ':id' => (int)$row['id']]);
        }

        return ['status' => 'success', 'message' => 'Conversation deleted.'];
    }

    public function createMessage($payload)
    {
        $senderType     = trim((string)($payload['sender_type'] ?? ''));
        $senderId       = (int)($payload['sender_id'] ?? 0);
        $receiverType   = trim((string)($payload['receiver_type'] ?? ''));
        $receiverId     = (int)($payload['receiver_id'] ?? 0);
        $message        = trim((string)($payload['message'] ?? ''));
        $replyToId      = isset($payload['reply_to_id']) && (int)$payload['reply_to_id'] > 0 ? (int)$payload['reply_to_id'] : null;
        $attachmentUrl  = $payload['attachment_url'] ?? null;
        $attachmentType = $payload['attachment_type'] ?? null;
        $attachmentName = $payload['attachment_name'] ?? null;

        if (!$senderType || !$senderId || !$receiverType || !$receiverId) {
            return ['status' => 'error', 'message' => 'sender_type, sender_id, receiver_type, receiver_id are required.', 'httpCode' => 422];
        }
        if ($message === '' && empty($attachmentUrl)) {
            return ['status' => 'error', 'message' => 'Message or attachment is required.', 'httpCode' => 422];
        }

        // If sender previously deleted this conversation, restore it for them
        $userKey = $senderType . '_' . $senderId;
        $clearStmt = $this->conn->prepare(
            "SELECT id, deleted_for FROM {$this->table}
             WHERE (sender_type = :st1 AND sender_id = :si1 AND receiver_type = :rt1 AND receiver_id = :ri1)
                OR (sender_type = :st2 AND sender_id = :si2 AND receiver_type = :rt2 AND receiver_id = :ri2)"
        );
        $clearStmt->execute([
            ':st1' => $senderType,   ':si1' => $senderId,
            ':rt1' => $receiverType, ':ri1' => $receiverId,
            ':st2' => $receiverType, ':si2' => $receiverId,
            ':rt2' => $senderType,   ':ri2' => $senderId,
        ]);
        $existingRows = $clearStmt->fetchAll(PDO::FETCH_ASSOC);
        $updateClearStmt = $this->conn->prepare(
            "UPDATE {$this->table} SET deleted_for = :deleted_for WHERE id = :id"
        );
        foreach ($existingRows as $row) {
            if (empty($row['deleted_for'])) continue;
            $deletedFor = json_decode($row['deleted_for'], true) ?? [];
            $deletedFor = array_values(array_filter($deletedFor, function($k) use ($userKey) { return $k !== $userKey; }));
            $updateClearStmt->execute([':deleted_for' => empty($deletedFor) ? null : json_encode($deletedFor), ':id' => (int)$row['id']]);
        }

        $stmt = $this->conn->prepare(
            "INSERT INTO {$this->table}
                (sender_type, sender_id, receiver_type, receiver_id, message,
                 reply_to_id, attachment_url, attachment_type, attachment_name, created_at, updated_at)
             VALUES
                (:sender_type, :sender_id, :receiver_type, :receiver_id, :message,
                 :reply_to_id, :attachment_url, :attachment_type, :attachment_name, NOW(), NOW())"
        );
        $stmt->execute([
            ':sender_type'     => $senderType,
            ':sender_id'       => $senderId,
            ':receiver_type'   => $receiverType,
            ':receiver_id'     => $receiverId,
            ':message'         => $message,
            ':reply_to_id'     => $replyToId,
            ':attachment_url'  => $attachmentUrl ?: null,
            ':attachment_type' => $attachmentType ?: null,
            ':attachment_name' => $attachmentName ?: null,
        ]);

        $newId = (int)$this->conn->lastInsertId();

        $fetchStmt = $this->conn->prepare(
            "SELECT m.*, rm.message AS reply_message, rm.sender_type AS reply_sender_type,
                    rm.attachment_type AS reply_attachment_type, rm.attachment_name AS reply_attachment_name
             FROM {$this->table} m
             LEFT JOIN {$this->table} rm ON rm.id = m.reply_to_id
             WHERE m.id = :id"
        );
        $fetchStmt->execute([':id' => $newId]);
        $saved = $fetchStmt->fetch(PDO::FETCH_ASSOC);

        return ['status' => 'success', 'message' => 'Message sent.', 'data' => $saved];
    }
}