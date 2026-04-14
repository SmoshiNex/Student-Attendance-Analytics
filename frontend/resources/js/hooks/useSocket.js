// hooks/useSocket.js
// Singleton Socket.io connection shared across all components.
// Usage:
//   const socket = useSocket()
//   socket.emit("send_message", { ... })
//   socket.on("receive_message", handler)

import { useEffect, useRef } from "react"
import { io } from "socket.io-client"

const LAN_HOST = import.meta.env.VITE_LAN_HOST || "localhost"
const SOCKET_PORT = import.meta.env.VITE_SOCKET_PORT || "3000"

// Build the socket server URL dynamically from your .env
function buildSocketUrl() {
  if (typeof window === "undefined") return `http://${LAN_HOST}:${SOCKET_PORT}`

  const { protocol, hostname } = window.location
  // When accessed from localhost (dev machine) use localhost,
  // otherwise keep whatever host the page was loaded from.
  const resolvedHost =
    hostname === "localhost" || hostname === "127.0.0.1" ? LAN_HOST : hostname

  return `${protocol}//${resolvedHost}:${SOCKET_PORT}`
}

// Module-level singleton so all components share one connection
let _socket = null

function getSocket() {
  if (!_socket) {
    _socket = io(buildSocketUrl(), {
      transports: ["websocket", "polling"],
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    })

    _socket.on("connect", () => console.log("[Socket] Connected:", _socket.id))
    _socket.on("disconnect", (reason) =>
      console.log("[Socket] Disconnected:", reason),
    )
    _socket.on("connect_error", (err) =>
      console.warn("[Socket] Connection error:", err.message),
    )
  }
  return _socket
}

/**
 * Returns the singleton socket instance.
 * Automatically disconnects when the last component using it unmounts
 * (optional cleanup — disabled by default so chat stays live on nav).
 */
export function useSocket() {
  const socketRef = useRef(getSocket())

  useEffect(() => {
    socketRef.current = getSocket()
    // Do NOT disconnect on unmount — keep alive during page navigation
  }, [])

  return socketRef.current
}
