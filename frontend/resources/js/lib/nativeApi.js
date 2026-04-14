const FALLBACK_API_BASE_PATH = "/Student%20Attedance%20Analytics/backend/api"
export const APP_BASE = import.meta.env.DEV
  ? ""
  : "/Student%20Attedance%20Analytics/public"

function ensureLeadingSlash(value) {
  if (!value) {
    return "/"
  }

  return value.startsWith("/") ? value : `/${value}`
}

export function normalizeAppPath(pathname = "/") {
  const currentPath = ensureLeadingSlash(String(pathname || "/"))
  const decodedBase = decodeURIComponent(APP_BASE)

  const stripBase = (basePath) => {
    if (!basePath || !currentPath.startsWith(basePath)) {
      return null
    }

    const stripped = currentPath.slice(basePath.length)
    if (!stripped) {
      return "/"
    }

    return ensureLeadingSlash(stripped)
  }

  return stripBase(APP_BASE) || stripBase(decodedBase) || currentPath
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "")
}

function getDefaultApiBaseUrl() {
  if (typeof window === "undefined") {
    return `http://localhost${FALLBACK_API_BASE_PATH}`
  }

  const { protocol, hostname } = window.location
  return `${protocol}//${hostname}${FALLBACK_API_BASE_PATH}`
}

export const NATIVE_API_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_NATIVE_API_BASE_URL || getDefaultApiBaseUrl(),
)

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1"
}

export function getPublicAppOrigin() {
  const forcedOrigin = trimTrailingSlash(
    import.meta.env.VITE_PUBLIC_APP_ORIGIN || "",
  )
  if (forcedOrigin) {
    return forcedOrigin
  }

  if (typeof window === "undefined") {
    return "http://localhost:5174"
  }

  const protocol = window.location.protocol
  const hostname = window.location.hostname
  const currentPort = window.location.port

  const lanHost = String(import.meta.env.VITE_LAN_HOST || "").trim()
  const lanPort = String(import.meta.env.VITE_LAN_PORT || "").trim()
  const useLanPort = import.meta.env.DEV

  const resolvedHost = isLoopbackHost(hostname) && lanHost ? lanHost : hostname
  const resolvedPort =
    isLoopbackHost(hostname) && useLanPort && lanPort ? lanPort : currentPort

  return trimTrailingSlash(
    `${protocol}//${resolvedHost}${resolvedPort ? `:${resolvedPort}` : ""}`,
  )
}

export function buildPublicAppUrl(pathname = "/") {
  const normalizedPath = ensureLeadingSlash(String(pathname || "/"))
  return `${getPublicAppOrigin()}${APP_BASE}${normalizedPath}`
}

function buildApiUrl(script, query = {}) {
  const baseWithSlash = `${NATIVE_API_BASE_URL}/`
  const url = new URL(script, baseWithSlash)

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return
    }
    url.searchParams.set(key, String(value))
  })

  return url.toString()
}

export function authApiUrl(action, query = {}) {
  return buildApiUrl("auth_api.php", { action, ...query })
}

export function attendanceApiUrl(action, query = {}) {
  return buildApiUrl("attendance_api.php", { action, ...query })
}

export function notificationApiUrl(action, query = {}) {
  return buildApiUrl("notification_api.php", { action, ...query })
}

export function teacherClassApiUrl(query = {}) {
  return buildApiUrl("teacher_class_api.php", query)
}

export function chatbotApiUrl(action, query = {}) {
  return buildApiUrl("chatbot_api.php", { action, ...query })
}

export function messagesApiUrl(action, query = {}) {
  return buildApiUrl("messages_api.php", { action, ...query })
}

export function getStoredStudentId() {
  if (typeof window === "undefined") {
    return ""
  }

  if (window.__nativeStudentId) {
    return String(window.__nativeStudentId)
  }

  const fromStorage = window.localStorage.getItem("nativeStudentId")
  return fromStorage ? String(fromStorage) : ""
}

export function navigateTo(path) {
  window.location.hash = path.startsWith("#") ? path : "#" + path
}

const routeBuilders = {
  login: () => APP_BASE + "/#/",
  "teacher.register": () => APP_BASE + "/#/teacher/register",
  "student.password.reset": () => APP_BASE + "/#/student/password-reset",
  "teacher.password.reset": () => APP_BASE + "/#/teacher/password-reset",

  "unified.login": () => authApiUrl("unified_login"),

  "teacher.attendance.start": (classId) =>
    attendanceApiUrl("create_session", { class_id: classId }),
  "teacher.attendance.live": (sessionId) =>
    attendanceApiUrl("live", { session_id: sessionId }),
  "teacher.attendance.end": (sessionId) =>
    attendanceApiUrl("close_session", { session_id: sessionId }),
  "attendance.scan": () => attendanceApiUrl("scan_qr"),

  "teacher.class.create": () => teacherClassApiUrl(),
  "teacher.class.update": (classId) => teacherClassApiUrl({ id: classId }),
  "teacher.class.delete": (classId) => teacherClassApiUrl({ id: classId }),
  "teacher.class.students": (classId) =>
    teacherClassApiUrl({ action: "students", id: classId }),

  "notifications.list": () => notificationApiUrl("list"),
  "notifications.mark_read": (id) => notificationApiUrl("mark_read", { id }),
  "notifications.mark_all_read": () => notificationApiUrl("mark_all_read"),
}

export function resolveNativeRoute(name, ...params) {
  const builder = routeBuilders[name]
  if (!builder) {
    return "#"
  }

  return builder(...params)
}
