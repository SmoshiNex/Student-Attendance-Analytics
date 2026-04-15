// ============================================================
//  backend/socket-server/server.js
//  Node.js + Socket.io real-time messaging server
//
//  Start: node server.js
//  Port : 3000  (add to Windows firewall — see add-firewall-5174.bat)
// ============================================================

"use strict"

const http = require("http")
const https = require("https")
const { createServer } = http
const { Server } = require("socket.io")
const mysql = require("mysql2/promise")
const path = require("path")
const fs = require("fs")
const { MessageService, MessageValidationError } = require("./MessageService")

// ── Load env from root .env ───────────────────────────────────
const envPath = path.resolve(__dirname, "../../.env")
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}

function requireEnv(name, options = {}) {
  const { allowEmpty = false } = options
  if (!(name in process.env)) {
    throw new Error(`[ENV] Missing required variable: ${name}`)
  }

  const value = process.env[name]
  if (!allowEmpty && String(value).trim() === "") {
    throw new Error(`[ENV] ${name} must not be empty.`)
  }

  return value
}

const SOCKET_PORT = parseInt(process.env.SOCKET_PORT || "3000", 10)
const LAN_HOST = requireEnv("VITE_LAN_HOST")
const SOCKET_AUTH_API_URL = process.env.SOCKET_AUTH_API_URL
  || `http://${requireEnv("VITE_LAN_HOST")}/Student%20Attedance%20Analytics/backend/api/auth_api.php`
const DB_HOST = requireEnv("DB_HOST")
const DB_USER = requireEnv("DB_USER")
const DB_PASSWORD = requireEnv("DB_PASSWORD", { allowEmpty: true })
const DB_NAME = requireEnv("DB_NAME")

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(String(value || ""), 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

const AUTH_VERIFY_TIMEOUT_MS = parsePositiveInt(
  process.env.SOCKET_AUTH_TIMEOUT_MS,
  4000,
)
const SEND_RATE_LIMIT_WINDOW_MS = parsePositiveInt(
  process.env.SOCKET_SEND_WINDOW_MS,
  10000,
)
const SEND_RATE_LIMIT_MAX = parsePositiveInt(process.env.SOCKET_SEND_MAX, 20)
const TYPING_RATE_LIMIT_WINDOW_MS = parsePositiveInt(
  process.env.SOCKET_TYPING_WINDOW_MS,
  3000,
)
const TYPING_RATE_LIMIT_MAX = parsePositiveInt(
  process.env.SOCKET_TYPING_MAX,
  40,
)

// ── MySQL connection pool ────────────────────────────────────
const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
})

const messageService = new MessageService(pool)

// Test DB connection on startup
pool
  .getConnection()
  .then((conn) => {
    console.log("[DB] Connected to MySQL successfully.")
    conn.release()
  })
  .catch((err) => {
    console.error("[DB] MySQL connection failed:", err.message)
    console.error("     Make sure XAMPP MySQL is running.")
    process.exit(1)
  })

// ── HTTP + Socket.io server ──────────────────────────────────
const httpServer = createServer((req, res) => {
  // Simple health-check endpoint so you can verify the server is up
  // by opening http://<LAN_HOST>:<SOCKET_PORT>/health in a browser
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: "ok", server: "socket-messaging" }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

const io = new Server(httpServer, {
  cors: {
    // Allow any local/private-IP origin (same pattern used in your PHP files)
    origin: (origin, callback) => {
      if (!origin) return callback(null, true) // server-to-server
      const allowed =
        /^https?:\/\/((localhost|127\.0\.0\.1)|(10\.\d{1,3}\.\d{1,3}\.\d{1,3})|(192\.168\.\d{1,3}\.\d{1,3})|(172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}))(:\d+)?$/.test(
          origin,
        )
      callback(allowed ? null : new Error("Not allowed by CORS"), allowed)
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Graceful transports: prefers WebSockets, falls back to long-polling
  transports: ["websocket", "polling"],
})

// ── In-memory map: userId_type → socket.id  ─────────────────
// Key format: "teacher_7" | "student_42"
// Value: socket.id string
const onlineUsers = new Map()

function takeRateToken(socket, bucket, maxEvents, windowMs) {
  const now = Date.now()
  const key = `rate_${bucket}`
  const existing = Array.isArray(socket.data[key]) ? socket.data[key] : []
  const recent = existing.filter((ts) => now - ts < windowMs)

  if (recent.length >= maxEvents) {
    socket.data[key] = recent
    return false
  }

  recent.push(now)
  socket.data[key] = recent
  return true
}

function requestJson(urlString, options = {}) {
  const timeoutMs = parsePositiveInt(options.timeoutMs, AUTH_VERIFY_TIMEOUT_MS)
  const extraHeaders = options.headers || {}

  return new Promise((resolve, reject) => {
    let parsedUrl
    try {
      parsedUrl = new URL(urlString)
    } catch (err) {
      reject(err)
      return
    }

    const client = parsedUrl.protocol === "https:" ? https : http
    const req = client.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port:
          parsedUrl.port || (parsedUrl.protocol === "https:" ? "443" : "80"),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: "GET",
        headers: {
          Accept: "application/json",
          ...extraHeaders,
        },
      },
      (res) => {
        let body = ""
        res.setEncoding("utf8")
        res.on("data", (chunk) => {
          body += chunk
          if (body.length > 1024 * 1024) {
            req.destroy(new Error("Auth response too large"))
          }
        })

        res.on("end", () => {
          const statusCode = res.statusCode || 0
          if (statusCode < 200 || statusCode >= 300) {
            resolve({ ok: false, statusCode, body: null })
            return
          }

          try {
            const decoded = JSON.parse(body || "{}")
            resolve({ ok: true, statusCode, body: decoded })
          } catch {
            resolve({ ok: false, statusCode, body: null })
          }
        })
      },
    )

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("Auth request timed out"))
    })

    req.on("error", reject)
    req.end()
  })
}

async function fetchSocketIdentity(cookieHeader) {
  if (!cookieHeader || String(cookieHeader).trim() === "") {
    return null
  }

  const authUrl = new URL(SOCKET_AUTH_API_URL)
  authUrl.searchParams.set("action", "socket_identity")

  const response = await requestJson(authUrl.toString(), {
    timeoutMs: AUTH_VERIFY_TIMEOUT_MS,
    headers: {
      Cookie: String(cookieHeader),
    },
  })

  if (!response.ok || !response.body || response.body.status !== "success") {
    return null
  }

  const user = response.body.user || {}
  const type = String(user.type || "")
    .trim()
    .toLowerCase()
  const id = Number(user.id)

  if (!["teacher", "student"].includes(type)) {
    return null
  }

  if (!Number.isInteger(id) || id <= 0) {
    return null
  }

  return { type, id }
}

// ── Socket.io connection handler ──────────────────────────────
io.on("connection", (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`)

  // ── Event: register ───────────────────────────────────────
  // Client must emit this right after connecting so we can
  // route messages to the right socket.
  // Payload: { user_type: 'teacher'|'student', user_id: number }
  socket.on("register", async (payload = {}) => {
    try {
      const requestedType = String(payload.user_type || "")
        .trim()
        .toLowerCase()
      const requestedId = Number(payload.user_id)

      if (
        !["teacher", "student"].includes(requestedType) ||
        !Number.isInteger(requestedId) ||
        requestedId <= 0
      ) {
        socket.emit("error", { message: "Invalid registration payload." })
        return
      }

      const identity = await fetchSocketIdentity(
        socket.handshake.headers.cookie,
      )
      if (!identity) {
        socket.emit("error", { message: "Unauthorized socket registration." })
        return
      }

      if (identity.type !== requestedType || identity.id !== requestedId) {
        socket.emit("error", { message: "Socket identity mismatch." })
        return
      }

      const previousKey = socket.data.userKey
      if (previousKey && onlineUsers.get(previousKey) === socket.id) {
        onlineUsers.delete(previousKey)
      }

      const key = `${identity.type}_${identity.id}`
      onlineUsers.set(key, socket.id)
      socket.data.userKey = key
      socket.data.userType = identity.type
      socket.data.userId = identity.id
      socket.data.isRegistered = true

      // Join a personal room so we can address this user individually
      socket.join(key)

      console.log(`[WS] Registered: ${key} → socket ${socket.id}`)

      // Tell the client their registration succeeded + who is online
      socket.emit("registered", { key, online: Array.from(onlineUsers.keys()) })

      // Broadcast presence to everyone else
      socket.broadcast.emit("user_online", { key })
    } catch (err) {
      console.error("[WS] register error:", err.message)
      socket.emit("error", { message: "Failed to register socket." })
    }
  })

  // ── Event: send_message ───────────────────────────────────
  // Payload: {
  //   sender_type, sender_id,
  //   receiver_type, receiver_id,
  //   class_id (optional),
  //   message
  // }
  socket.on("send_message", async (data = {}) => {
    try {
      if (!socket.data.isRegistered) {
        socket.emit("error", {
          message: "Please register before sending messages.",
        })
        return
      }

      if (
        !takeRateToken(
          socket,
          "send_message",
          SEND_RATE_LIMIT_MAX,
          SEND_RATE_LIMIT_WINDOW_MS,
        )
      ) {
        socket.emit("error", {
          message: "Too many messages. Please slow down.",
        })
        return
      }

      const incomingSenderType =
        data.sender_type === undefined || data.sender_type === null
          ? socket.data.userType
          : String(data.sender_type).trim().toLowerCase()
      const incomingSenderId =
        data.sender_id === undefined || data.sender_id === null
          ? socket.data.userId
          : Number(data.sender_id)

      if (
        incomingSenderType !== socket.data.userType ||
        incomingSenderId !== socket.data.userId
      ) {
        socket.emit("error", { message: "Sender identity mismatch." })
        return
      }

      const payload = {
        ...data,
        sender_type: socket.data.userType,
        sender_id: socket.data.userId,
      }

      const saved = await messageService.createMessage(payload)

      // ── Deliver to receiver (if online) ──
      const receiverKey = `${saved.receiver_type}_${saved.receiver_id}`
      io.to(receiverKey).emit("receive_message", saved)

      // ── Confirm delivery to sender ──
      socket.emit("message_sent", saved)

      const preview = (saved.message || "[attachment]").slice(0, 40)
      console.log(
        `[MSG] ${saved.sender_type}#${saved.sender_id} → ${saved.receiver_type}#${saved.receiver_id}: "${preview}"`,
      )
    } catch (err) {
      if (err instanceof MessageValidationError) {
        socket.emit("error", { message: err.message })
        return
      }

      console.error("[WS] send_message error:", err.message)
      socket.emit("error", { message: "Failed to send message." })
    }
  })

  // ── Event: typing ─────────────────────────────────────────
  // Lightweight: just relay, no DB write.
  // Payload: { sender_type, sender_id, receiver_type, receiver_id, is_typing }
  socket.on("typing", (data = {}) => {
    if (!socket.data.isRegistered) {
      return
    }

    if (
      !takeRateToken(
        socket,
        "typing",
        TYPING_RATE_LIMIT_MAX,
        TYPING_RATE_LIMIT_WINDOW_MS,
      )
    ) {
      return
    }

    const incomingSenderType =
      data.sender_type === undefined || data.sender_type === null
        ? socket.data.userType
        : String(data.sender_type).trim().toLowerCase()
    const incomingSenderId =
      data.sender_id === undefined || data.sender_id === null
        ? socket.data.userId
        : Number(data.sender_id)

    if (
      incomingSenderType !== socket.data.userType ||
      incomingSenderId !== socket.data.userId
    ) {
      return
    }

    try {
      const typingPayload = messageService.validateTypingPayload({
        ...data,
        sender_type: socket.data.userType,
        sender_id: socket.data.userId,
      })

      const receiverKey = `${typingPayload.receiver_type}_${typingPayload.receiver_id}`
      io.to(receiverKey).emit("typing", {
        sender_type: typingPayload.sender_type,
        sender_id: typingPayload.sender_id,
        is_typing: typingPayload.is_typing,
      })
    } catch (err) {
      if (err instanceof MessageValidationError) {
        return
      }

      console.error("[WS] typing error:", err.message)
    }
  })

  // ── Disconnect ────────────────────────────────────────────
  socket.on("disconnect", () => {
    const key = socket.data.userKey
    if (key && onlineUsers.get(key) === socket.id) {
      onlineUsers.delete(key)
      io.emit("user_offline", { key })
      console.log(`[WS] Disconnected: ${key}`)
    } else if (key) {
      console.log(`[WS] Disconnected stale socket: ${key}`)
    } else {
      console.log(`[WS] Anonymous disconnected: ${socket.id}`)
    }
  })
})

// ── Start listening ──────────────────────────────────────────
httpServer.listen(SOCKET_PORT, "0.0.0.0", () => {
  console.log("")
  console.log("╔══════════════════════════════════════════════════╗")
  console.log("║   Smart Campus Attendance — Socket.io Server      ║")
  console.log("╚══════════════════════════════════════════════════╝")
  console.log(`  Listening on  :  0.0.0.0:${SOCKET_PORT}`)
  console.log(`  LAN access    :  http://${LAN_HOST}:${SOCKET_PORT}`)
  console.log(`  Health check  :  http://${LAN_HOST}:${SOCKET_PORT}/health`)
  console.log("")
})
