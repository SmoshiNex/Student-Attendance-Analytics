import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { attendanceApiUrl, teacherClassApiUrl } from "@/lib/nativeApi"
import Header from "../DashboardUI/Header"
import {
  TrendingUp,
  Users,
  Calendar,
  AlertTriangle,
  Award,
  TrendingDown,
} from "lucide-react"

function toTitleCase(str) {
  if (!str) return ""
  return String(str)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function StatCard({ label, value, sub, icon: Icon, color = "gray" }) {
  const colors = {
    green: "bg-green-50 text-green-700 border-green-200",
    red: "bg-red-50 text-red-700 border-red-200",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    gray: "bg-gray-50 text-gray-700 border-gray-200",
  }
  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium opacity-80">{label}</p>
        {Icon && <Icon className="w-5 h-5 opacity-60" />}
      </div>
      <p className="text-3xl font-bold">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-70">{sub}</p>}
    </div>
  )
}

function StatusBar({ present, late, absent }) {
  const total = present + late + absent
  if (total === 0)
    return <div className="h-2 rounded-full bg-gray-200 w-full" />
  const pPct = (present / total) * 100
  const lPct = (late / total) * 100
  const aPct = (absent / total) * 100
  return (
    <div className="flex h-2 rounded-full overflow-hidden w-full">
      <div style={{ width: `${pPct}%` }} className="bg-green-500" />
      <div style={{ width: `${lPct}%` }} className="bg-yellow-400" />
      <div style={{ width: `${aPct}%` }} className="bg-red-400" />
    </div>
  )
}

export default function TeacherAnalytics() {
  const navigate = useNavigate()
  const mountedRef = useRef(true)

  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState("")
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [classesLoading, setClassesLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    mountedRef.current = true
    axios
      .get(teacherClassApiUrl(), { withCredentials: true })
      .then((res) => {
        if (!mountedRef.current) return
        const list = res.data?.classes || []
        setClasses(list)
        if (list.length > 0) setSelectedClassId(String(list[0].id))
      })
      .catch(() => {
        if (mountedRef.current) navigate("/", { replace: true })
      })
      .finally(() => {
        if (mountedRef.current) setClassesLoading(false)
      })
    return () => {
      mountedRef.current = false
    }
  }, [navigate])

  useEffect(() => {
    if (!selectedClassId) return
    setLoading(true)
    setError("")
    setData(null)
    axios
      .get(
        attendanceApiUrl("teacher_analytics", { class_id: selectedClassId }),
        { withCredentials: true },
      )
      .then((res) => {
        if (mountedRef.current) setData(res.data)
      })
      .catch((err) => {
        if (!mountedRef.current) return
        if (err?.response?.status === 401) {
          navigate("/", { replace: true })
          return
        }
        setError(err?.response?.data?.message || "Failed to load analytics.")
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false)
      })
  }, [selectedClassId, navigate])

  const overview = data?.overview
  const trend = data?.trend || []
  const students = data?.students || []
  const atRiskCount = students.filter((s) => s.at_risk).length

  if (classesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 teacher-shell">
      <Header active="analytics" />

      <main className="md:pl-64 transition-[padding] duration-300 py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Page header + class selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Class Analytics
              </h1>
              <p className="text-sm text-gray-500">
                Attendance insights per class
              </p>
            </div>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black"
            >
              {classes.length === 0 && <option value="">No classes</option>}
              {classes.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.class_code} — {c.subject_name || c.class_name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading && (
            <div className="text-center py-16 text-gray-400">
              Loading analytics...
            </div>
          )}

          {!loading && overview && (
            <>
              {/* Overview cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Class Attendance Rate"
                  value={`${overview.avg_attendance_rate}%`}
                  sub="Average across all sessions"
                  icon={TrendingUp}
                  color="blue"
                />
                <StatCard
                  label="Sessions Held"
                  value={overview.total_sessions}
                  sub="Ended sessions"
                  icon={Calendar}
                  color="gray"
                />
                <StatCard
                  label="Students Enrolled"
                  value={overview.total_enrolled}
                  icon={Users}
                  color="gray"
                />
                <StatCard
                  label="Students Below 75%"
                  value={atRiskCount}
                  sub="Need attention"
                  icon={AlertTriangle}
                  color={atRiskCount > 0 ? "red" : "green"}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <StatCard
                  label="Highest Session Rate"
                  value={`${overview.best_session_rate}%`}
                  sub="Best performing session"
                  icon={Award}
                  color="green"
                />
                <StatCard
                  label="Lowest Session Rate"
                  value={`${overview.worst_session_rate}%`}
                  sub="Worst performing session"
                  icon={TrendingDown}
                  color="red"
                />
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                  <p className="text-sm font-medium text-gray-600 mb-3">
                    Total Records
                  </p>
                  <div className="flex gap-4">
                    <div>
                      <p className="text-xs text-gray-400">Present</p>
                      <p className="text-xl font-bold text-green-600">
                        {overview.total_present}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Late</p>
                      <p className="text-xl font-bold text-yellow-500">
                        {overview.total_late}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Absent</p>
                      <p className="text-xl font-bold text-red-500">
                        {overview.total_absent}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Session trend */}
              {trend.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-base font-semibold text-gray-900 mb-1">
                    Session-by-Session Trend
                  </h2>
                  <p className="text-xs text-gray-400 mb-4">
                    Each row is one ended attendance session
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b">
                          <th className="pb-2 pr-4">#</th>
                          <th className="pb-2 pr-4">Date</th>
                          <th className="pb-2 pr-4 text-green-600">Present</th>
                          <th className="pb-2 pr-4 text-yellow-600">Late</th>
                          <th className="pb-2 pr-4 text-red-500">Absent</th>
                          <th className="pb-2 pr-4">Attendance Rate</th>
                          <th className="pb-2 w-32">Breakdown</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {trend.map((row, idx) => (
                          <tr key={row.session_id}>
                            <td className="py-2 pr-4 text-gray-400 text-xs">
                              #{idx + 1}
                            </td>
                            <td className="py-2 pr-4 font-medium">
                              {row.label}
                            </td>
                            <td className="py-2 pr-4 text-green-600">
                              {row.present}
                            </td>
                            <td className="py-2 pr-4 text-yellow-600">
                              {row.late}
                            </td>
                            <td className="py-2 pr-4 text-red-500">
                              {row.absent}
                            </td>
                            <td className="py-2 pr-4 font-semibold">
                              {row.attendance_rate}%
                            </td>
                            <td className="py-2 w-32">
                              <StatusBar
                                present={row.present}
                                late={row.late}
                                absent={row.absent}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {trend.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
                  <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">
                    No ended sessions yet for this class.
                  </p>
                </div>
              )}

              {/* Per-student breakdown */}
              {students.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-base font-semibold text-gray-900 mb-1">
                    Student Attendance Summary
                  </h2>
                  <p className="text-xs text-gray-400 mb-4">
                    Each student's attendance record across all sessions in this
                    class
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b">
                          <th className="pb-2 pr-4">Student</th>
                          <th className="pb-2 pr-4">ID</th>
                          <th className="pb-2 pr-4 text-green-600">Present</th>
                          <th className="pb-2 pr-4 text-yellow-600">Late</th>
                          <th className="pb-2 pr-4 text-red-500">Absent</th>
                          <th className="pb-2 pr-4">Rate</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {students.map((s) => (
                          <tr
                            key={s.id}
                            className={s.at_risk ? "bg-red-50" : ""}
                          >
                            <td className="py-2 pr-4 font-medium">
                              {toTitleCase(s.student_name)}
                            </td>
                            <td className="py-2 pr-4 text-gray-500">
                              {s.student_id}
                            </td>
                            <td className="py-2 pr-4 text-green-600">
                              {s.present}
                            </td>
                            <td className="py-2 pr-4 text-yellow-600">
                              {s.late}
                            </td>
                            <td className="py-2 pr-4 text-red-500">
                              {s.absent}
                            </td>
                            <td className="py-2 pr-4 font-semibold">
                              {s.attendance_rate}%
                            </td>
                            <td className="py-2">
                              {s.at_risk ? (
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                  At Risk
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                                  Good
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {!loading && !overview && !error && selectedClassId && (
            <div className="text-center py-16 text-gray-400 text-sm">
              No data available.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
