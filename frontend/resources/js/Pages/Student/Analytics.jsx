import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { attendanceApiUrl } from "@/lib/nativeApi"
import Header from "./DashboardUI/Header"
import {
  TrendingUp,
  BookOpen,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
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
    gray: "bg-white text-gray-700 border-gray-200",
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

function RateBar({ rate }) {
  const color =
    rate >= 75 ? "bg-green-500" : rate >= 50 ? "bg-yellow-400" : "bg-red-400"
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
      <span className="text-xs font-semibold w-10 text-right">{rate}%</span>
    </div>
  )
}

export default function StudentAnalytics() {
  const navigate = useNavigate()
  const mountedRef = useRef(true)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    mountedRef.current = true
    axios
      .get(attendanceApiUrl("student_analytics"), { withCredentials: true })
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
    return () => {
      mountedRef.current = false
    }
  }, [navigate])

  const summary = data?.summary
  const classes = data?.classes || []
  const monthly = data?.monthly || []
  const atRiskClasses = classes.filter((c) => c.at_risk)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 student-shell">
      <Header active="analytics" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            My Attendance Analytics
          </h1>
          <p className="text-sm text-gray-500">
            Your attendance breakdown per class
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {summary && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                label="My Overall Attendance Rate"
                value={`${summary.overall_rate}%`}
                sub="Across all enrolled classes"
                icon={TrendingUp}
                color={summary.overall_rate >= 75 ? "green" : "red"}
              />
              <StatCard
                label="Enrolled Classes"
                value={summary.total_classes}
                sub="Classes you are in"
                icon={BookOpen}
                color="blue"
              />
              <StatCard
                label="Times Marked Present"
                value={summary.total_present}
                sub="Including on-time check-ins"
                icon={CheckCircle}
                color="green"
              />
              <StatCard
                label="Times Marked Absent"
                value={summary.total_absent}
                sub="Missed sessions"
                icon={AlertTriangle}
                color={summary.total_absent > 0 ? "red" : "gray"}
              />
            </div>

            {/* At-risk warning */}
            {atRiskClasses.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <p className="text-sm font-semibold text-red-700">
                    {atRiskClasses.length} class
                    {atRiskClasses.length > 1 ? "es" : ""} below 75% attendance
                  </p>
                </div>
                <ul className="space-y-1">
                  {atRiskClasses.map((c) => (
                    <li key={c.class_id} className="text-sm text-red-600">
                      {c.class_code} — {c.subject_name || c.class_name}:{" "}
                      <strong>{c.attendance_rate}%</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Per-class breakdown */}
            {classes.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-1">
                  Attendance Per Class
                </h2>
                <p className="text-xs text-gray-400 mb-4">
                  Your attendance record in each class you are enrolled in
                </p>
                <div className="space-y-4">
                  {classes.map((c) => (
                    <div
                      key={c.class_id}
                      className={`rounded-lg border p-4 ${c.at_risk ? "border-red-200 bg-red-50" : "border-gray-100"}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-sm text-gray-900">
                            {c.class_code} — {c.subject_name || c.class_name}
                          </p>
                          <p className="text-xs text-gray-500">
                            Instructor: {toTitleCase(c.teacher_name)}
                          </p>
                        </div>
                        {c.at_risk ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                            At Risk
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            Good Standing
                          </span>
                        )}
                      </div>
                      <RateBar rate={c.attendance_rate} />
                      <div className="flex flex-wrap gap-4 mt-2 text-xs">
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-3 h-3" /> Present:{" "}
                          {c.present}
                        </span>
                        <span className="flex items-center gap-1 text-yellow-600">
                          <Clock className="w-3 h-3" /> Late: {c.late}
                        </span>
                        <span className="flex items-center gap-1 text-red-500">
                          <XCircle className="w-3 h-3" /> Absent: {c.absent}
                        </span>
                        <span className="text-gray-400">
                          out of {c.total_sessions} session
                          {c.total_sessions !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly trend */}
            {monthly.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-1">
                  Monthly Attendance Trend
                </h2>
                <p className="text-xs text-gray-400 mb-4">
                  How many sessions you attended vs missed each month
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b">
                        <th className="pb-2 pr-6">Month</th>
                        <th className="pb-2 pr-6 text-green-600">
                          Sessions Attended
                        </th>
                        <th className="pb-2 pr-6 text-red-500">
                          Sessions Missed
                        </th>
                        <th className="pb-2">Attendance Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {monthly.map((m) => {
                        const total = m.attended + m.absent
                        const rate =
                          total > 0 ? Math.round((m.attended / total) * 100) : 0
                        return (
                          <tr key={m.label}>
                            <td className="py-2 pr-6 font-medium">{m.label}</td>
                            <td className="py-2 pr-6 text-green-600">
                              {m.attended}
                            </td>
                            <td className="py-2 pr-6 text-red-500">
                              {m.absent}
                            </td>
                            <td className="py-2 w-40">
                              <RateBar rate={rate} />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {classes.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">
                  No attendance data yet. Check in to a class to see your
                  analytics.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
