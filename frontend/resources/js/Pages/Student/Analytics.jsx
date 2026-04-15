import { useState, useEffect, useRef, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { attendanceApiUrl } from "@/lib/nativeApi"
import Header from "./DashboardUI/Header"
import {
  TrendingUp, BookOpen, AlertTriangle, CheckCircle, XCircle,
  Clock, Calendar, Zap, ChevronDown, ChevronRight,
} from "lucide-react"
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Line,
  RadialBarChart, RadialBar, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts"

function toTitleCase(str) {
  if (!str) return ""
  return String(str).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function StatCard({ label, value, sub, icon: Icon, color = "gray" }) {
  const colors = {
    green:  "bg-green-50 text-green-700 border-green-200",
    red:    "bg-red-50 text-red-700 border-red-200",
    blue:   "bg-blue-50 text-blue-700 border-blue-200",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
    gray:   "bg-white text-gray-700 border-gray-200",
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium opacity-80">{label}</p>
        {Icon && <Icon className="w-4 h-4 opacity-60" />}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-70">{sub}</p>}
    </div>
  )
}

const rateColor = (rate) => rate >= 75 ? "#22c55e" : rate >= 50 ? "#eab308" : "#ef4444"
const PIE_COLORS = ["#22c55e", "#eab308", "#ef4444"]

function sessionsNeededToRecover(present, late, totalSessions) {
  const attended = present + late
  if (totalSessions === 0 || (attended / totalSessions) * 100 >= 75) return 0
  return Math.max(Math.ceil((0.75 * totalSessions - attended) / 0.25), 0)
}

function trailingConsecutiveAbsences(timeline) {
  let count = 0
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].status === "absent") count++
    else break
  }
  return count
}

// Inline expanded detail for a single class
function ClassDetail({ c, timeline }) {
  const present = c.present, late = c.late, absent = c.absent
  const total = present + late + absent
  const rate = c.attendance_rate
  const recoveryNeeded = sessionsNeededToRecover(present, late, c.total_sessions)
  const consecutiveAbsences = trailingConsecutiveAbsences(timeline)

  const pieData = [
    { name: "Present", value: present },
    { name: "Late",    value: late },
    { name: "Absent",  value: absent },
  ]

  const sessionBarData = timeline.map((s, i) => ({
    name: `#${i + 1} ${s.label}`,
    Present: s.status === "present" ? 1 : 0,
    Late:    s.status === "late"    ? 1 : 0,
    Absent:  s.status === "absent"  ? 1 : 0,
  }))

  return (
    <div className="mt-3 space-y-4 border-t border-gray-100 pt-4">

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Attendance Rate" value={`${rate}%`}
          sub={c.class_code} icon={TrendingUp}
          color={rate >= 75 ? "green" : "red"}
        />
        <StatCard label="Sessions" value={c.total_sessions} sub="Ended sessions" icon={Calendar} color="blue" />
        <StatCard label="Present"  value={present} sub="On-time check-ins" icon={CheckCircle} color="green" />
        <StatCard label="Late"     value={late}    sub="After allowed time" icon={Clock}       color="yellow" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard label="Absent" value={absent} sub="Missed sessions" icon={AlertTriangle} color={absent > 0 ? "red" : "gray"} />
        {c.at_risk && recoveryNeeded > 0 && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-indigo-600" />
              <p className="text-sm font-semibold text-indigo-700">Recovery Plan</p>
            </div>
            <p className="text-2xl font-bold text-indigo-700">{recoveryNeeded}</p>
            <p className="text-xs text-indigo-500 mt-1">consecutive present sessions needed to reach 75%</p>
          </div>
        )}
      </div>

      {/* At-risk banner */}
      {c.at_risk && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">
            Your attendance rate is <strong>{rate}%</strong>, below the 75% threshold. You are at risk.
          </p>
        </div>
      )}

      {/* Consecutive absences warning */}
      {consecutiveAbsences >= 2 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
          <p className="text-sm text-orange-700">
            You have missed <strong>{consecutiveAbsences} sessions in a row</strong>. Attend your next class to stop this streak.
          </p>
        </div>
      )}

      {/* Charts row */}
      {total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Session bar chart */}
          {sessionBarData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm font-semibold text-gray-900 mb-1">Session Breakdown</p>
              <p className="text-xs text-gray-400 mb-3">Your status per session</p>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={sessionBarData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} ticks={[0, 1]} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Present" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Late"    fill="#eab308" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Absent"  fill="#ef4444" radius={[3, 3, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Pie chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900 mb-1">Overall Status</p>
            <p className="text-xs text-gray-400 mb-3">Combined across all sessions</p>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v, name) => [`${v}`, name]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Session log table */}
      {timeline.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-900 mb-1">Session Log</p>
          <p className="text-xs text-gray-400 mb-3">All ended sessions with your check-in time</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Check-in Time</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((s, i) => (
                  <tr key={s.session_id} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 text-gray-400">{i + 1}</td>
                    <td className="py-1.5 text-gray-700">{s.label}</td>
                    <td className="py-1.5 text-gray-500 text-xs">{s.checked_in_at || "—"}</td>
                    <td className="py-1.5">
                      {s.status === "present" && <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle className="w-3 h-3" /> Present</span>}
                      {s.status === "late"    && <span className="inline-flex items-center gap-1 text-yellow-600 text-xs font-medium"><Clock className="w-3 h-3" /> Late</span>}
                      {s.status === "absent"  && <span className="inline-flex items-center gap-1 text-red-500 text-xs font-medium"><XCircle className="w-3 h-3" /> Absent</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {timeline.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No ended sessions yet for this class.</p>
        </div>
      )}
    </div>
  )
}

export default function StudentAnalytics() {
  const navigate = useNavigate()
  const mountedRef = useRef(true)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [expandedClassId, setExpandedClassId] = useState(null)

  // ============================================================
  // STUDENT ANALYTICS — API CALL: student_analytics
  // ============================================================
  // Fetches summary, classes, monthly trend, and timeline_by_class
  // from Attendance::getStudentAnalytics().
  // Runs once on mount — no filter params needed (all data returned).
  // ============================================================
  useEffect(() => {
    mountedRef.current = true
    axios.get(attendanceApiUrl("student_analytics"), { withCredentials: true })
      .then((res) => { if (mountedRef.current) setData(res.data) })
      .catch((err) => {
        if (!mountedRef.current) return
        if (err?.response?.status === 401) { navigate("/", { replace: true }); return }
        setError(err?.response?.data?.message || "Failed to load analytics.")
      })
      .finally(() => { if (mountedRef.current) setLoading(false) })
    return () => { mountedRef.current = false }
  }, [navigate])

  const allClasses      = data?.classes || []
  const allMonthly      = data?.monthly || []
  const timelineByClass = data?.timeline_by_class || {}
  const rawSummary      = data?.summary

  const atRiskClasses = allClasses.filter((c) => c.at_risk)

  // ============================================================
  // STUDENT ANALYTICS — PIE CHART DATA (Overall Status)
  // ============================================================
  // Feeds the "Overall Status" PieChart with total present/late/absent
  // counts across all classes. Sourced from the summary query.
  // ============================================================
  const pieData = rawSummary ? [
    { name: "Present", value: rawSummary.total_present },
    { name: "Late",    value: rawSummary.total_late },
    { name: "Absent",  value: rawSummary.total_absent },
  ] : []

  // ============================================================
  // STUDENT ANALYTICS — RADIAL BAR CHART DATA (Rate Per Class)
  // ============================================================
  // Feeds the "Attendance Rate Per Class" RadialBarChart.
  // Each bar = one class, colored green/yellow/red by rate threshold.
  // ============================================================
  const radialData = allClasses.map((c) => ({
    name: c.class_code,
    rate: c.attendance_rate,
    fill: rateColor(c.attendance_rate),
  }))

  // ============================================================
  // STUDENT ANALYTICS — MONTHLY TREND CHART DATA
  // ============================================================
  // Transforms the monthly array from the DB into Recharts format:
  // bars for Attended/Missed, line for monthly Rate %.
  // Displayed in the "Monthly Attendance Trend" ComposedChart.
  // ============================================================
  const monthlyComposedData = allMonthly.map((m) => {
    const total = m.attended + m.absent
    return {
      name: m.label,
      Attended: m.attended,
      Missed: m.absent,
      "Rate %": total > 0 ? Math.round((m.attended / total) * 1000) / 10 : 0,
    }
  })

  const toggleClass = (classId) =>
    setExpandedClassId((prev) => (prev === classId ? null : classId))

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-500">Loading...</p></div>
  }

  return (
    <div className="min-h-screen bg-gray-50 student-shell">
      <Header active="analytics" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Attendance Analytics</h1>
          <p className="text-sm text-gray-500">Overview across all your enrolled classes</p>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {rawSummary && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                label="My Overall Attendance Rate"
                value={`${rawSummary.overall_rate}%`}
                sub="Across all enrolled classes"
                icon={TrendingUp}
                color={rawSummary.overall_rate >= 75 ? "green" : "red"}
              />
              <StatCard label="Enrolled Classes" value={rawSummary.total_classes} sub="Classes you are in" icon={BookOpen} color="blue" />
              <StatCard label="Times Present" value={rawSummary.total_present} sub="Including on-time check-ins" icon={CheckCircle} color="green" />
              <StatCard label="Times Absent"  value={rawSummary.total_absent}  sub="Missed sessions" icon={AlertTriangle} color={rawSummary.total_absent > 0 ? "red" : "gray"} />
            </div>

            {/* At-risk warning */}
            {atRiskClasses.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <p className="text-sm font-semibold text-red-700">
                    {atRiskClasses.length} class{atRiskClasses.length > 1 ? "es" : ""} below 75% attendance
                  </p>
                </div>
                <ul className="space-y-1">
                  {atRiskClasses.map((c) => (
                    <li key={c.class_id} className="text-sm text-red-600">
                      <button
                        className="underline underline-offset-2 hover:text-red-800"
                        onClick={() => setExpandedClassId(String(c.class_id))}
                      >
                        {c.class_code} — {c.subject_name || c.class_name}
                      </button>
                      : <strong>{c.attendance_rate}%</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Overall charts */}
            {allClasses.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {(rawSummary.total_present + rawSummary.total_late + rawSummary.total_absent > 0) && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-base font-semibold text-gray-900 mb-1">Overall Status</h2>
                    <p className="text-xs text-gray-400 mb-2">All sessions across all classes</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                          {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                        </Pie>
                        <Tooltip formatter={(v, name) => [`${v}`, name]} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {radialData.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h2 className="text-base font-semibold text-gray-900 mb-1">Attendance Rate Per Class</h2>
                    <p className="text-xs text-gray-400 mb-2">Green ≥ 75% · Yellow ≥ 50% · Red &lt; 50%</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <RadialBarChart cx="50%" cy="50%" innerRadius={20} outerRadius={90} data={radialData} startAngle={90} endAngle={-270}>
                        <RadialBar dataKey="rate" cornerRadius={4} label={{ position: "insideStart", fill: "#fff", fontSize: 10 }} />
                        <Tooltip formatter={(v) => `${v}%`} />
                        <Legend iconSize={10} formatter={(value, entry) => `${entry.payload.name} ${entry.payload.rate}%`} wrapperStyle={{ fontSize: 11 }} />
                      </RadialBarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* Monthly trend */}
            {monthlyComposedData.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-1">Monthly Attendance Trend</h2>
                <p className="text-xs text-gray-400 mb-4">Sessions attended vs missed (bars) + monthly rate % (line)</p>
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={monthlyComposedData} margin={{ top: 4, right: 30, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => name === "Rate %" ? `${v}%` : v} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="left" dataKey="Attended" fill="#22c55e" radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="left" dataKey="Missed"   fill="#ef4444" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="Rate %" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Per-class expandable cards */}
            {allClasses.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-1">Attendance Per Class</h2>
                <p className="text-xs text-gray-400 mb-4">Click a class to expand its full session breakdown and check-in times</p>
                <div className="space-y-3">
                  {allClasses.map((c) => {
                    const isExpanded = expandedClassId === String(c.class_id)
                    const timeline   = timelineByClass[String(c.class_id)] || []
                    return (
                      <div
                        key={c.class_id}
                        className={`rounded-lg border transition ${
                          c.at_risk
                            ? "border-red-200 bg-red-50"
                            : "border-gray-100 bg-gray-50"
                        }`}
                      >
                        {/* Clickable header row */}
                        <button
                          onClick={() => toggleClass(String(c.class_id))}
                          className="w-full text-left p-4"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {isExpanded
                                ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                                : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />}
                              <div>
                                <p className="font-semibold text-sm text-gray-900">{c.class_code} — {c.subject_name || c.class_name}</p>
                                <p className="text-xs text-gray-500">Instructor: {toTitleCase(c.teacher_name)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {c.at_risk
                                ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">At Risk</span>
                                : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Good Standing</span>}
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="flex items-center gap-2 mb-2 ml-6">
                            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(c.attendance_rate, 100)}%`, backgroundColor: rateColor(c.attendance_rate) }} />
                            </div>
                            <span className="text-xs font-semibold w-10 text-right">{c.attendance_rate}%</span>
                          </div>
                          {/* Quick stats */}
                          <div className="flex flex-wrap gap-4 text-xs ml-6">
                            <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-3 h-3" /> Present: {c.present}</span>
                            <span className="flex items-center gap-1 text-yellow-600"><Clock className="w-3 h-3" /> Late: {c.late}</span>
                            <span className="flex items-center gap-1 text-red-500"><XCircle className="w-3 h-3" /> Absent: {c.absent}</span>
                            <span className="text-gray-400">out of {c.total_sessions} session{c.total_sessions !== 1 ? "s" : ""}</span>
                          </div>
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="px-4 pb-4">
                            <ClassDetail c={c} timeline={timeline} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {allClasses.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No attendance data yet. Check in to a class to see your analytics.</p>
              </div>
            )}
          </>
        )}

      </main>
    </div>
  )
}
