import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/Components/ui/dialog"
import { QRCodeSVG } from "qrcode.react"
import { Clock, Users, UserCheck, UserX, AlertTriangle } from "lucide-react"
import axios from "axios"
import { attendanceApiUrl, teacherClassApiUrl } from "@/lib/nativeApi"
import { toast } from "@/lib/toast"

export default function LiveAttendanceModal({
  isOpen,
  onClose,
  classData,
  onSessionEnded,
}) {
  const [session, setSession] = useState(null)
  const [records, setRecords] = useState([])
  const [stats, setStats] = useState({
    total: 0,
    present: 0,
    late: 0,
    absent: 0,
  })
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [loading, setLoading] = useState(false)
  const [endingSession, setEndingSession] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [enrolledStudents, setEnrolledStudents] = useState([])
  const isStarting = useRef(false)
  const sessionStartRef = useRef(null) // stores { started_at, duration_minutes } to avoid timer restarts

  const toMs = (value) => {
    if (!value) return NaN
    return new Date(String(value).replace(" ", "T")).getTime()
  }

  const getRemainingSeconds = (timing) => {
    if (!timing) return 0
    if (!Number.isFinite(timing.startedAtMs)) return 0
    if (!Number.isFinite(timing.serverTimeAtStart)) return 0
    if (!Number.isFinite(timing.browserTimeAtStart)) return 0

    const browserElapsed = Math.max(0, Date.now() - timing.browserTimeAtStart)
    const serverNowMs = timing.serverTimeAtStart + browserElapsed
    const deadlineMs = timing.startedAtMs + timing.duration_minutes * 60 * 1000

    // Use ceil so users don't lose a second immediately because of network/processing delay.
    return Math.max(0, Math.ceil((deadlineMs - serverNowMs) / 1000))
  }

  // Start attendance session
  const startSession = async (duration) => {
    if (!classData || isStarting.current) return

    isStarting.current = true
    setLoading(true)
    try {
      const response = await axios.post(
        attendanceApiUrl("create_session", { class_id: classData.id }),
        { duration_minutes: duration },
        { withCredentials: true },
      )
      setSession(response.data.session)
      const _serverTime = response.data.server_time
      const _startedAt = response.data.session.started_at
      const startedAtMs = toMs(_startedAt)
      const serverTimeAtStart = toMs(_serverTime)
      sessionStartRef.current = {
        startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : Date.now(),
        duration_minutes: response.data.session.duration_minutes,
        serverTimeAtStart: Number.isFinite(serverTimeAtStart)
          ? serverTimeAtStart
          : Date.now(),
        browserTimeAtStart: Date.now(),
      }
      setTimeRemaining(getRemainingSeconds(sessionStartRef.current))
      toast.success(
        "Session Started",
        `Attendance session started for ${response.data.session.duration_minutes} minute(s).`,
      )
      fetchLiveData(response.data.session.id)
    } catch (error) {
      console.error("Error starting session:", error)
      toast.error(
        "Failed to Start Session",
        error?.response?.data?.message || "Failed to start attendance session.",
      )
    } finally {
      setLoading(false)
      isStarting.current = false
    }
  }

  // Fetch enrolled students for the class
  const fetchEnrolledStudents = async () => {
    if (!classData) return
    try {
      const response = await axios.get(
        teacherClassApiUrl({ action: "students", id: classData.id }),
        { withCredentials: true },
      )
      setEnrolledStudents(response.data.students || [])
    } catch (error) {
      console.error("Error fetching enrolled students:", error)
    }
  }

  // Fetch live attendance data
  const fetchLiveData = async (sessionId) => {
    try {
      const response = await axios.get(
        attendanceApiUrl("live", { session_id: sessionId }),
        { withCredentials: true, silent: true },
      )
      setRecords(response.data.records)
      setStats(response.data.stats)
      const updatedSession = response.data.session
      setSession(updatedSession)
      if (!sessionStartRef.current && updatedSession?.started_at) {
        const serverTime =
          response.data.server_time ?? updatedSession.started_at
        const startedAt = updatedSession.started_at
        const startedAtMs = toMs(startedAt)
        const serverTimeAtStart = toMs(serverTime)
        sessionStartRef.current = {
          startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : Date.now(),
          duration_minutes: updatedSession.duration_minutes,
          serverTimeAtStart: Number.isFinite(serverTimeAtStart)
            ? serverTimeAtStart
            : Date.now(),
          browserTimeAtStart: Date.now(),
        }
        setTimeRemaining(getRemainingSeconds(sessionStartRef.current))
      }
      if (updatedSession.status === "ended") {
        setTimeRemaining(0)
      }
    } catch (error) {
      console.error("Error fetching attendance:", error)
      // If session not found or ended, check if we should keep modal open
      if (error.response?.status === 404) {
        // Session might have been ended, but keep modal open if classData has active_session_id
        // This prevents auto-closing
      }
    }
  }

  // End session
  const endSession = async () => {
    if (!session?.id) return

    setEndingSession(true)
    try {
      const response = await axios.post(
        attendanceApiUrl("close_session", { session_id: session.id }),
        {},
        { withCredentials: true },
      )

      const absentCount = Number(response?.data?.absent_count || 0)

      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: "ended",
            }
          : prev,
      )
      setStats((prev) => ({
        ...prev,
        absent: (prev.absent || 0) + absentCount,
      }))
      setTimeRemaining(0)
      setShowEndConfirm(false)
      toast.success(
        "Session Ended",
        absentCount > 0
          ? `Session ended. ${absentCount} student(s) marked absent.`
          : "Session ended successfully.",
      )
      setSession(null)
      setRecords([])
      setStats({ total: 0, present: 0, late: 0, absent: 0 })
      sessionStartRef.current = null
      onClose(false)
      onSessionEnded?.()
    } catch (error) {
      console.error("Error ending session:", error)
      toast.error(
        "Action Failed",
        error?.response?.data?.message || "Failed to end session.",
      )
    } finally {
      setEndingSession(false)
    }
  }

  // Calculate time remaining for on-time check-in
  useEffect(() => {
    if (!session?.id) return

    const tick = () => {
      const timing = sessionStartRef.current
      if (!timing) return

      const diff = getRemainingSeconds(timing)
      setTimeRemaining(diff)

      if (diff % 5 === 0 || diff === 0) {
        fetchLiveData(session.id)
      }
    }

    tick()
    const interval = setInterval(tick, 1000)

    return () => clearInterval(interval)
  }, [session?.id])

  // Load enrolled students and existing active session when modal opens
  useEffect(() => {
    if (isOpen && classData) {
      // Always fetch enrolled students when modal opens
      fetchEnrolledStudents()

      // Load existing active session if it exists
      if (classData.active_session_id && !session) {
        fetchLiveData(classData.active_session_id)
      }
    }
  }, [isOpen, classData])

  // Reset state when modal closes (only if no active session)
  useEffect(() => {
    if (!isOpen && !classData?.active_session_id) {
      setSession(null)
      setRecords([])
      setStats({ total: 0, present: 0, late: 0, absent: 0 })
      setTimeRemaining(0)
      setShowEndConfirm(false)
      setEndingSession(false)
      isStarting.current = false
      sessionStartRef.current = null
    }
  }, [isOpen, classData])

  // Format time remaining - show hours if duration is long
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const qrCodeUrl = session
    ? `${window.location.protocol}//${window.location.hostname}/attendance/scan/${session.id}`
    : ""

  if (!classData) return null

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          // Prevent closing if there's an active session
          if (!open) {
            if (session && session.status === "active") {
              // Don't close - keep modal open for active sessions
              return
            }
            if (classData?.active_session_id && !session) {
              // Don't close if class has active session but we haven't loaded it yet
              return
            }
          }
          onClose(open)
        }}
      >
        <DialogContent hideCloseButton={session?.status === "active"} className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <div className="flex-1">
              <DialogTitle>Live Attendance Session</DialogTitle>
              {/* Subject code + subject name */}
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {classData?.class_code && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-xs font-semibold text-gray-700 border border-gray-200">
                    {classData.class_code}
                  </span>
                )}
                {classData?.subject_name && (
                  <p className="text-sm text-gray-700 font-medium">
                    {classData.subject_name}
                  </p>
                )}
              </div>
              {/* Teacher name */}
              {(classData?.teacher_first_name || classData?.teacher_last_name) && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Instructor: {classData.teacher_first_name} {classData.teacher_last_name}
                </p>
              )}
              {/* Session started time */}
              {session && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Started:{" "}
                  {new Date(session.started_at).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </p>
              )}
            </div>
          </DialogHeader>

          {!session ? (
            // Start Session Form
            <div className="space-y-4 py-6">
              <h3 className="text-lg font-semibold">
                Start Attendance Session
              </h3>
              <p className="text-sm text-gray-600">
                Enter time allowed for students to check in as PRESENT:
              </p>

              {/* Show Enrolled Students Before Starting */}
              {enrolledStudents.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Enrolled Students ({enrolledStudents.length})
                  </p>
                  <div className="max-h-32 overflow-y-auto">
                    <div className="space-y-1">
                      {enrolledStudents.map((student) => (
                        <div
                          key={student.id}
                          className="flex items-center gap-2 text-sm text-gray-600"
                        >
                          <UserX className="w-4 h-4 text-gray-400" />
                          <span>
                            {student.first_name} {student.last_name}
                          </span>
                          <span className="text-xs text-gray-400">
                            ({student.student_id})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="duration"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Duration (minutes)
                  </label>
                  <input
                    type="number"
                    id="duration"
                    min="1"
                    max="180"
                    defaultValue={15}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                    placeholder="Enter minutes (1-180, up to 3 hours)"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Maximum: 180 minutes (3 hours)
                  </p>
                </div>

                <button
                  onClick={() => {
                    const input = document.getElementById("duration")
                    const duration = parseInt(input.value) || 15
                    if (duration < 1 || duration > 180) {
                      toast.warning(
                        "Invalid Duration",
                        "Please enter a duration between 1 and 180 minutes.",
                      )
                      return
                    }
                    startSession(duration)
                  }}
                  disabled={loading}
                  className="w-full px-6 py-4 bg-black text-white text-base font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Starting..." : "Start Attendance Session"}
                </button>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs text-gray-500 mb-2">Quick presets:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                  {[5, 10, 15].map((duration) => (
                    <button
                      key={duration}
                      onClick={() => {
                        document.getElementById("duration").value = duration
                      }}
                      className="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      {duration} min
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[30, 60, 120].map((duration) => (
                    <button
                      key={duration}
                      onClick={() => {
                        document.getElementById("duration").value = duration
                      }}
                      className="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      {duration === 60
                        ? "1 hour"
                        : duration === 120
                          ? "2 hours"
                          : `${duration} min`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            // Live Session View
            <div className="space-y-6">
              {/* Timer */}
              <div
                className={`rounded-lg p-6 text-center ${
                  session.status === "ended"
                    ? "bg-gray-600 text-white"
                    : timeRemaining === 0
                      ? "bg-yellow-600 text-white"
                      : "bg-black text-white"
                }`}
              >
                <Clock className="w-8 h-8 mx-auto mb-2" />
                <div className="text-3xl sm:text-4xl font-bold">
                  {session.status === "ended"
                    ? "ENDED"
                    : timeRemaining === 0
                      ? "00:00"
                      : formatTime(timeRemaining)}
                </div>
                <p className="text-sm text-gray-300 mt-1">
                  {session.status === "ended"
                    ? "Session Ended"
                    : timeRemaining === 0
                      ? "Late Check-ins Only"
                      : "Time Remaining"}
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-100 rounded-lg p-4 text-center">
                  <Users className="w-5 h-5 mx-auto mb-1 text-gray-600" />
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <p className="text-xs text-gray-600">Total</p>
                </div>
                <div
                  className="rounded-lg p-4 text-center"
                  style={{ backgroundColor: "#B9F8CF" }}
                >
                  <UserCheck className="w-5 h-5 mx-auto mb-1 text-gray-800" />
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.present}
                  </div>
                  <p className="text-xs text-gray-700">Present</p>
                </div>
                <div
                  className="rounded-lg p-4 text-center"
                  style={{ backgroundColor: "#FFF085" }}
                >
                  <UserX className="w-5 h-5 mx-auto mb-1 text-gray-800" />
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.late}
                  </div>
                  <p className="text-xs text-gray-700">Late</p>
                </div>
                <div
                  className="rounded-lg p-4 text-center"
                  style={{ backgroundColor: "#FFC9C9" }}
                >
                  <UserX className="w-5 h-5 mx-auto mb-1 text-gray-800" />
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.absent || 0}
                  </div>
                  <p className="text-xs text-gray-700">Absent</p>
                </div>
              </div>

              {/* QR Code */}
              {session.status === "ended" ? (
                <div className="bg-gray-100 rounded-lg p-6 text-center border-2 border-gray-300">
                  <p className="text-sm text-gray-600 font-medium">
                    Session has ended
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Students can no longer check in
                  </p>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-6 text-center">
                  <p className="text-sm text-gray-600 mb-4">
                    {timeRemaining === 0
                      ? "Late check-ins allowed - Students scan this QR code"
                      : "Students scan this QR code to check in"}
                  </p>
                  <div className="inline-block bg-white p-4 rounded-lg border-2 border-gray-200">
                    <QRCodeSVG value={qrCodeUrl} size={200} level="H" />
                  </div>
                </div>
              )}

              {/* All Students List */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Students ({stats.total})
                </h3>
                <div className="bg-white border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                  {records.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      No students enrolled
                    </div>
                  ) : (
                    <div className="divide-y">
                      {records.map((record) => (
                        <div
                          key={record.id || record.student_id}
                          className="p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-3">
                            {record.has_checked_in ? (
                              record.status === "present" ? (
                                <UserCheck className="w-5 h-5 text-green-500" />
                              ) : (
                                <UserX className="w-5 h-5 text-yellow-500" />
                              )
                            ) : (
                              <UserX className="w-5 h-5 text-gray-300" />
                            )}
                            <div>
                              <p className="font-medium text-sm">
                                {record.student_name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {record.student_id}
                              </p>
                            </div>
                          </div>
                          <div className="text-left sm:text-right">
                            {record.has_checked_in ? (
                              <>
                                <p className="text-xs text-gray-600">
                                  {record.checked_in_at}
                                </p>
                                <span
                                  className="text-xs font-semibold px-2 py-1 rounded"
                                  style={{
                                    backgroundColor:
                                      record.status === "present"
                                        ? "#B9F8CF"
                                        : record.status === "late"
                                          ? "#FFF085"
                                          : "#FFC9C9",
                                    color:
                                      record.status === "present"
                                        ? "#064e3b"
                                        : "#111827",
                                  }}
                                >
                                  {record.status === "present"
                                    ? "PRESENT"
                                    : record.status === "late"
                                      ? "LATE"
                                      : "ABSENT"}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs font-semibold px-2 py-1 rounded bg-gray-100 text-gray-600">
                                NOT CHECKED IN
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* End Session Button */}
              {session.status === "ended" ? (
                <div className="w-full py-3 bg-gray-400 text-white font-semibold rounded-lg text-center cursor-not-allowed">
                  Session Ended
                </div>
              ) : (
                <button
                  onClick={() => setShowEndConfirm(true)}
                  className="w-full py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
                >
                  End Session
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* End Session Confirmation Modal - Outside Dialog for proper z-index */}
      {showEndConfirm && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-[9000] animate-in fade-in-0 duration-200"
            onClick={() => setShowEndConfirm(false)}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[9001] pointer-events-none">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl pointer-events-auto animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 sm:slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    End Attendance Session?
                  </h3>
                  <p className="text-sm text-gray-500">
                    This action cannot be undone
                  </p>
                </div>
              </div>

              <p className="text-gray-600 mb-6">
                Are you sure you want to end this attendance session? Students
                will no longer be able to check in.
              </p>

              <div className="flex flex-col-reverse sm:flex-row gap-3">
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="w-full px-4 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={endSession}
                  disabled={endingSession}
                  className="w-full px-4 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
                >
                  {endingSession ? "Ending..." : "End Session"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
