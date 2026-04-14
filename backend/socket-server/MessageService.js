"use strict"

const ALLOWED_USER_TYPES = new Set(["teacher", "student"])
const ALLOWED_ATTACHMENT_TYPES = new Set(["image", "pdf", "file"])
const MAX_MESSAGE_LENGTH = 5000
const MAX_ATTACHMENT_URL_LENGTH = 2048
const MAX_ATTACHMENT_NAME_LENGTH = 255

class MessageValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = "MessageValidationError"
  }
}

class MessageService {
  constructor(pool) {
    this.pool = pool
  }

  normalizeUserType(value, fieldName) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
    if (!ALLOWED_USER_TYPES.has(normalized)) {
      throw new MessageValidationError(
        `${fieldName} must be either teacher or student.`,
      )
    }
    return normalized
  }

  normalizePositiveInt(value, fieldName) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new MessageValidationError(
        `${fieldName} must be a positive integer.`,
      )
    }
    return parsed
  }

  normalizeOptionalPositiveInt(value, fieldName) {
    if (value === undefined || value === null || value === "") {
      return null
    }

    return this.normalizePositiveInt(value, fieldName)
  }

  normalizeAttachmentFields(attachmentUrl, attachmentType, attachmentName) {
    const hasUrl =
      attachmentUrl !== undefined &&
      attachmentUrl !== null &&
      String(attachmentUrl).trim() !== ""

    if (!hasUrl) {
      return {
        attachment_url: null,
        attachment_type: null,
        attachment_name: null,
      }
    }

    const normalizedUrl = String(attachmentUrl).trim()
    if (normalizedUrl.length > MAX_ATTACHMENT_URL_LENGTH) {
      throw new MessageValidationError("Attachment URL is too long.")
    }

    let parsedUrl
    try {
      parsedUrl = new URL(normalizedUrl)
    } catch {
      throw new MessageValidationError("Attachment URL is invalid.")
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new MessageValidationError("Attachment URL must use http or https.")
    }

    const normalizedType = String(attachmentType || "")
      .trim()
      .toLowerCase()
    if (normalizedType && !ALLOWED_ATTACHMENT_TYPES.has(normalizedType)) {
      throw new MessageValidationError("Invalid attachment type.")
    }

    const normalizedName = String(attachmentName || "").trim()
    if (normalizedName.length > MAX_ATTACHMENT_NAME_LENGTH) {
      throw new MessageValidationError("Attachment name is too long.")
    }

    return {
      attachment_url: normalizedUrl,
      attachment_type: normalizedType || "file",
      attachment_name: normalizedName || null,
    }
  }

  validateSendPayload(data) {
    const {
      sender_type,
      sender_id,
      receiver_type,
      receiver_id,
      class_id,
      message,
      attachment_url,
      attachment_type,
      attachment_name,
    } = data || {}

    const normalizedSenderType = this.normalizeUserType(
      sender_type,
      "sender_type",
    )
    const normalizedSenderId = this.normalizePositiveInt(sender_id, "sender_id")
    const normalizedReceiverType = this.normalizeUserType(
      receiver_type,
      "receiver_type",
    )
    const normalizedReceiverId = this.normalizePositiveInt(
      receiver_id,
      "receiver_id",
    )
    const normalizedClassId = this.normalizeOptionalPositiveInt(
      class_id,
      "class_id",
    )

    const normalizedMessage = String(message || "").trim()
    if (normalizedMessage.length > MAX_MESSAGE_LENGTH) {
      throw new MessageValidationError("Message is too long.")
    }

    const attachmentFields = this.normalizeAttachmentFields(
      attachment_url,
      attachment_type,
      attachment_name,
    )

    if (!normalizedMessage && !attachmentFields.attachment_url) {
      throw new MessageValidationError("Message or attachment is required.")
    }

    return {
      sender_type: normalizedSenderType,
      sender_id: normalizedSenderId,
      receiver_type: normalizedReceiverType,
      receiver_id: normalizedReceiverId,
      class_id: normalizedClassId,
      message: normalizedMessage,
      attachment_url: attachmentFields.attachment_url,
      attachment_type: attachmentFields.attachment_type,
      attachment_name: attachmentFields.attachment_name,
    }
  }

  validateTypingPayload(data) {
    const { sender_type, sender_id, receiver_type, receiver_id, is_typing } =
      data || {}

    return {
      sender_type: this.normalizeUserType(sender_type, "sender_type"),
      sender_id: this.normalizePositiveInt(sender_id, "sender_id"),
      receiver_type: this.normalizeUserType(receiver_type, "receiver_type"),
      receiver_id: this.normalizePositiveInt(receiver_id, "receiver_id"),
      is_typing: !!is_typing,
    }
  }

  async saveMessage({
    senderType,
    senderId,
    receiverType,
    receiverId,
    classId,
    message,
    attachmentUrl,
    attachmentType,
    attachmentName,
  }) {
    const [result] = await this.pool.execute(
      `INSERT INTO messages
                (sender_type, sender_id, receiver_type, receiver_id, class_id, message,
                 attachment_url, attachment_type, attachment_name, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        senderType,
        senderId,
        receiverType,
        receiverId,
        classId,
        message,
        attachmentUrl,
        attachmentType,
        attachmentName,
      ],
    )
    return result.insertId
  }

  async fetchMessage(id) {
    const [rows] = await this.pool.execute(
      `SELECT id, sender_type, sender_id, receiver_type, receiver_id,
                    class_id, message, attachment_url, attachment_type, attachment_name,
                    is_read, created_at
             FROM messages WHERE id = ?`,
      [id],
    )
    return rows[0] || null
  }

  async getUserName(type, id) {
    const normalizedType = this.normalizeUserType(type, "type")
    const normalizedId = this.normalizePositiveInt(id, "id")
    const table = normalizedType === "teacher" ? "teachers" : "students"
    const [rows] = await this.pool.execute(
      `SELECT first_name, last_name FROM ${table} WHERE id = ?`,
      [normalizedId],
    )
    if (!rows[0]) return "Unknown"
    return `${rows[0].first_name} ${rows[0].last_name}`.trim()
  }

  async createMessage(data) {
    const payload = this.validateSendPayload(data)

    const insertId = await this.saveMessage({
      senderType: payload.sender_type,
      senderId: payload.sender_id,
      receiverType: payload.receiver_type,
      receiverId: payload.receiver_id,
      classId: payload.class_id,
      message: payload.message,
      attachmentUrl: payload.attachment_url,
      attachmentType: payload.attachment_type,
      attachmentName: payload.attachment_name,
    })

    const saved = await this.fetchMessage(insertId)
    if (!saved) {
      throw new Error("Message saved but could not be retrieved.")
    }

    saved.sender_name = await this.getUserName(
      payload.sender_type,
      payload.sender_id,
    )
    return saved
  }
}

module.exports = {
  MessageService,
  MessageValidationError,
}
