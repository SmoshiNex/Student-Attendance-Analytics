import { Bell, CheckCircle, XCircle, Clock, Mail } from "lucide-react"
import { useEffect, useState } from "react"
import axios from "axios"
import { authApiUrl, notificationApiUrl } from "@/lib/nativeApi"
import { useNavigate } from "react-router-dom"
import Header from "./DashboardUI/Header"

export default function StudentNotifications() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchNotifications = () => {
    axios
      .get(notificationApiUrl("list"), { withCredentials: true })
      .then((res) => setNotifications(res.data?.notifications || []))
      .catch(() => {
        navigate("/", { replace: true })
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    axios
      .get(authApiUrl("current_student"), { withCredentials: true })
      .then((res) => {
        if (!res.data?.student) {
          navigate("/", { replace: true })
          return
        }
        fetchNotifications()
      })
      .catch(() => {
        navigate("/", { replace: true })
      })
  }, [navigate])

  const getTypeIcon = (type) => {
    switch (type) {
      case "attendance":
        return (
          <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
        )
      case "email_sent":
        return (
          <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0" />
        )
      case "email_failed":
        return (
          <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 flex-shrink-0" />
        )
      default:
        return (
          <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 flex-shrink-0" />
        )
    }
  }

  const getStatusBadge = (status) => {
    const base = "px-2 py-1 rounded-full text-xs font-semibold"
    if (status === "success") return `${base} bg-green-100 text-green-700`
    if (status === "failed") return `${base} bg-red-100 text-red-700`
    return `${base} bg-yellow-100 text-yellow-700`
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 student-shell">
      <Header active="notifications" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
              : "All caught up!"}
          </p>
        </div>

        {notifications.length > 0 ? (
          <div className="space-y-3 sm:space-y-4">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`border rounded-xl sm:rounded-2xl p-4 sm:p-6 transition-colors ${
                  notification.read_at
                    ? "bg-gray-50 border-gray-200"
                    : "bg-white border-gray-300 shadow-sm"
                }`}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="mt-0.5 sm:mt-1 flex-shrink-0">
                    {getTypeIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3
                          className={`font-semibold text-base sm:text-lg break-words ${notification.read_at ? "text-gray-600" : "text-gray-900"}`}
                        >
                          {notification.title}
                        </h3>
                        <p
                          className={`text-xs sm:text-sm mt-1 break-words ${notification.read_at ? "text-gray-500" : "text-gray-700"}`}
                        >
                          {notification.message}
                        </p>
                        {(notification.metadata?.class_name ||
                          notification.metadata?.subject_name ||
                          notification.metadata?.schedule) && (
                          <div className="mt-2 text-xs text-gray-500">
                            {notification.metadata?.class_name && (
                              <span>
                                Class: {notification.metadata.class_name}
                              </span>
                            )}
                            {notification.metadata?.subject_name && (
                              <span className="block mt-1">
                                Subject: {notification.metadata.subject_name}
                              </span>
                            )}
                            {notification.metadata?.schedule && (
                              <span className="block mt-1">
                                Schedule: {notification.metadata.schedule}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <span
                        className={`${getStatusBadge(notification.status)} flex-shrink-0 self-start`}
                      >
                        {notification.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-3 text-xs text-gray-400">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      <span>
                        {new Date(notification.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Notifications
            </h3>
            <p className="text-sm text-gray-500">
              You don't have any notifications yet.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
