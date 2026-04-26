import { useState, useEffect, useRef, useMemo } from "react"
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
  X,
  Download,
  ChevronUp,
  ChevronDown,
} from "lucide-react"
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts"

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

const PIE_COLORS = ["#22c55e", "#eab308", "#ef4444"]

function exportPdf(
  students,
  classLabel,
  filteredTrend,
  recordsBySession,
  overview,
  dateFrom,
  dateTo,
) {
  import("jspdf").then(({ default: jsPDF }) => {
    import("jspdf-autotable").then(({ applyPlugin, autoTable }) => {
      applyPlugin(jsPDF)
      const doc = new jsPDF({ orientation: "landscape" })

      // Title
      doc.setFontSize(16)
      doc.text(`Analytics Report — ${classLabel}`, 14, 16)
      doc.setFontSize(9)
      doc.setTextColor(120)
      const rangeLabel =
        dateFrom || dateTo
          ? ` · ${dateFrom || ""} → ${dateTo || "today"}`
          : " · All time"
      doc.text(`Generated: ${new Date().toLocaleString()}${rangeLabel}`, 14, 22)
      doc.setTextColor(0)

      // Overview summary row
      if (overview) {
        doc.setFontSize(10)
        doc.text(
          `Sessions: ${overview.total_sessions}  |  Avg Rate: ${overview.avg_attendance_rate}%  |  Present: ${overview.total_present}  |  Late: ${overview.total_late}  |  Absent: ${overview.total_absent}`,
          14,
          29,
        )
      }

      // Student summary table
      const summaryHead = [
        [
          "Student Name",
          "Student ID",
          "Present",
          "Late",
          "Absent",
          "Rate",
          "Status",
        ],
      ]
      const summaryBody = students.map((s) => [
        toTitleCase(s.student_name),
        s.student_id,
        s.present,
        s.late,
        s.absent,
        `${s.attendance_rate}%`,
        s.at_risk ? "At Risk" : "Good",
      ])

      autoTable(doc, {
        startY: 34,
        head: summaryHead,
        body: summaryBody,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: {
          fillColor: [11, 43, 70],
          textColor: 255,
          fontStyle: "bold",
        },
        didParseCell(data) {
          if (data.section === "body" && data.column.index === 6) {
            data.cell.styles.textColor =
              data.cell.raw === "At Risk" ? [220, 38, 38] : [22, 163, 74]
            data.cell.styles.fontStyle = "bold"
          }
        },
      })

      // Per-session detail tables — one per student
      if (filteredTrend.length > 0) {
        students.forEach((s) => {
          const sessionRows = filteredTrend.map((session, i) => {
            const rec = recordsBySession[session.session_id]?.[s.id]
            return [
              i + 1,
              session.label,
              rec?.checked_in_at || "—",
              (rec?.status || "absent").toUpperCase(),
            ]
          })

          autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 8,
            head: [
              [
                {
                  content: toTitleCase(s.student_name) + " — " + s.student_id,
                  colSpan: 4,
                  styles: {
                    fillColor: [243, 244, 246],
                    textColor: [30, 30, 30],
                    fontStyle: "bold",
                  },
                },
              ],
              ["#", "Session Date", "Check-in Time", "Status"],
            ],
            body: sessionRows,
            theme: "grid",
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [229, 231, 235], textColor: [80, 80, 80] },
            didParseCell(data) {
              if (data.section === "body" && data.column.index === 3) {
                const v = String(data.cell.raw).toLowerCase()
                if (v === "present") data.cell.styles.textColor = [22, 163, 74]
                else if (v === "late")
                  data.cell.styles.textColor = [202, 138, 4]
                else if (v === "absent")
                  data.cell.styles.textColor = [220, 38, 38]
                data.cell.styles.fontStyle = "bold"
              }
            },
          })
        })
      }

      doc.save(`${classLabel || "analytics"}-attendance.pdf`)
    })
  })
}

function exportCsv(students, className, filteredTrend, recordsBySession) {
  // Header: summary columns + one column per session
  const sessionHeaders = filteredTrend.map(
    (s, i) => `"#${i + 1} ${s.label} (${s.started_at}) - Status"`,
  )
  const timeHeaders = filteredTrend.map(
    (s, i) => `"#${i + 1} ${s.label} - Check-in Time"`,
  )
  const header = [
    "Student Name",
    "Student ID",
    "Present",
    "Late",
    "Absent",
    "Attendance Rate",
    "Status",
    ...sessionHeaders,
    ...timeHeaders,
  ]

  const rows = students.map((s) => {
    const summary = [
      toTitleCase(s.student_name),
      s.student_id,
      s.present,
      s.late,
      s.absent,
      `${s.attendance_rate}%`,
      s.at_risk ? "At Risk" : "Good",
    ]
    const statuses = filteredTrend.map(
      (session) =>
        recordsBySession[session.session_id]?.[s.id]?.status || "absent",
    )
    const checkTimes = filteredTrend.map(
      (session) =>
        recordsBySession[session.session_id]?.[s.id]?.checked_in_at || "—",
    )
    return [...summary, ...statuses, ...checkTimes]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  })

  const csv = [header.join(","), ...rows].join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${className || "class"}-attendance.csv`
  a.click()
  URL.revokeObjectURL(url)
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

  // Filters
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [timeFrom, setTimeFrom] = useState("")
  const [timeTo, setTimeTo] = useState("")
  const [studentStatus, setStudentStatus] = useState("all")
  const [activePreset, setActivePreset] = useState("")

  // Sort state for student table
  const [sortKey, setSortKey] = useState("student_name")
  const [sortDir, setSortDir] = useState("asc")
  const [expandedStudentId, setExpandedStudentId] = useState(null)

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

  // ============================================================
  // TEACHER ANALYTICS — API CALL: teacher_analytics
  // ============================================================
  // Fetches overview metrics, session trend, student list, and
  // raw records_by_session from Attendance::getTeacherAnalytics().
  // Triggered whenever the teacher selects a different class.
  // ============================================================
  useEffect(() => {
    if (!selectedClassId) return
    setLoading(true)
    setError("")
    setData(null)
    setDateFrom("")
    setDateTo("")
    setTimeFrom("")
    setTimeTo("")
    setStudentStatus("all")
    setActivePreset("")
    setSortKey("student_name")
    setSortDir("asc")
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
  const allTrend = data?.trend || []
  const allStudents = data?.students || []
  const recordsBySession = data?.records_by_session || {}

  // ============================================================
  // TEACHER ANALYTICS — DATE/TIME FILTER (filteredTrend)
  // ============================================================
  // Filters the session trend array by the selected date/time range.
  // Used by the stat cards, charts, and student table so all metrics
  // update together when the teacher applies a filter.
  // ============================================================
  const filteredTrend = useMemo(() => {
    if (!dateFrom && !dateTo && !timeFrom && !timeTo) return allTrend
    return allTrend.filter((row) => {
      const sessionDate = String(row.started_at).slice(0, 10)
      const sessionTime = String(row.started_at).slice(11, 16) // "HH:MM"
      if (dateFrom && sessionDate < dateFrom) return false
      if (dateTo && sessionDate > dateTo) return false
      if (timeFrom && sessionTime < timeFrom) return false
      if (timeTo && sessionTime > timeTo) return false
      return true
    })
  }, [allTrend, dateFrom, dateTo, timeFrom, timeTo])

  // ============================================================
  // TEACHER ANALYTICS — STUDENT COUNTS RECALCULATION
  // ============================================================
  // When a date filter is active, re-derives each student's
  // present/late/absent counts and attendance_rate from only the
  // filtered sessions using the records_by_session lookup.
  // This avoids a new API call for every filter change.
  // ============================================================
  // When date filters are active, recompute each student's counts from only the filtered sessions
  const studentsWithFilteredCounts = useMemo(() => {
    if (!dateFrom && !dateTo && !timeFrom && !timeTo) return allStudents
    const filteredSessionIds = new Set(filteredTrend.map((r) => r.session_id))

    return allStudents.map((s) => {
      let present = 0,
        late = 0,
        absent = 0
      filteredSessionIds.forEach((sid) => {
        const rec = recordsBySession[sid]?.[s.id]
        const status = rec?.status
        if (status === "present") present++
        else if (status === "late") late++
        else absent++
      })
      const total = filteredSessionIds.size
      const rate =
        total > 0 ? Math.round(((present + late) / total) * 1000) / 10 : 0
      return {
        ...s,
        present,
        late,
        absent,
        attendance_rate: rate,
        at_risk: rate < 75,
      }
    })
  }, [
    allStudents,
    filteredTrend,
    dateFrom,
    dateTo,
    timeFrom,
    timeTo,
    recordsBySession,
  ])

  const filteredStudents = useMemo(() => {
    let list = studentsWithFilteredCounts
    if (studentStatus === "at_risk") list = list.filter((s) => s.at_risk)
    else if (studentStatus === "good") list = list.filter((s) => !s.at_risk)

    return [...list].sort((a, b) => {
      let av = a[sortKey],
        bv = b[sortKey]
      if (typeof av === "string") av = av.toLowerCase()
      if (typeof bv === "string") bv = bv.toLowerCase()
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
  }, [studentsWithFilteredCounts, studentStatus, sortKey, sortDir])

  // ============================================================
  // TEACHER ANALYTICS — FILTERED OVERVIEW (Stat Cards)
  // ============================================================
  // Recomputes the 7 overview metrics (avg rate, best/worst rate,
  // total present/late/absent, session count) from the filtered
  // trend rows so the stat cards always reflect the active filter.
  // ============================================================
  const filteredOverview = useMemo(() => {
    if (!overview) return null
    if (!dateFrom && !dateTo && !timeFrom && !timeTo) return overview
    if (filteredTrend.length === 0)
      return {
        ...overview,
        total_sessions: 0,
        avg_attendance_rate: 0,
        best_session_rate: 0,
        worst_session_rate: 0,
        total_present: 0,
        total_late: 0,
        total_absent: 0,
      }
    const rates = filteredTrend.map((r) => r.attendance_rate)
    return {
      ...overview,
      total_sessions: filteredTrend.length,
      avg_attendance_rate:
        Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10,
      best_session_rate: Math.max(...rates),
      worst_session_rate: Math.min(...rates),
      total_present: filteredTrend.reduce((a, r) => a + r.present, 0),
      total_late: filteredTrend.reduce((a, r) => a + r.late, 0),
      total_absent: filteredTrend.reduce((a, r) => a + r.absent, 0),
    }
  }, [overview, filteredTrend, dateFrom, dateTo, timeFrom, timeTo])

  // ============================================================
  // TEACHER ANALYTICS — TREND DIRECTION BADGE
  // ============================================================
  // Compares avg attendance rate of the first half of sessions vs
  // the second half to show an "Improving" / "Declining" / "Stable"
  // badge next to the page title.
  // ============================================================
  // Trend direction: compare avg rate of first half vs second half of sessions
  const trendDirection = useMemo(() => {
    if (allTrend.length < 4) return null
    const mid = Math.floor(allTrend.length / 2)
    const firstHalf = allTrend.slice(0, mid)
    const secondHalf = allTrend.slice(mid)
    const avg = (arr) =>
      arr.reduce((s, r) => s + r.attendance_rate, 0) / arr.length
    const diff = avg(secondHalf) - avg(firstHalf)
    if (Math.abs(diff) < 2) return "stable"
    return diff > 0 ? "up" : "down"
  }, [allTrend])

  const atRiskCount = allStudents.filter((s) => s.at_risk).length
  const hasActiveFilters =
    dateFrom ||
    dateTo ||
    timeFrom ||
    timeTo ||
    studentStatus !== "all" ||
    activePreset !== ""

  const pieData = filteredOverview
    ? [
        { name: "Present", value: filteredOverview.total_present },
        { name: "Late", value: filteredOverview.total_late },
        { name: "Absent", value: filteredOverview.total_absent },
      ]
    : []

  // ============================================================
  // TEACHER ANALYTICS — COMPOSED CHART DATA (Bar + Line)
  // ============================================================
  // Transforms filteredTrend into the shape Recharts expects:
  // bars for Present/Late/Absent counts, line for Rate %.
  // Displayed in the "Session-by-Session Trend" chart.
  // ============================================================
  // ComposedChart data: bars for counts + line for attendance rate %
  const composedData = filteredTrend.map((row, idx) => ({
    name: `#${idx + 1} ${row.label}`,
    Present: row.present,
    Late: row.late,
    Absent: row.absent,
    "Rate %": row.attendance_rate,
  }))

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const SortIcon = ({ col }) => {
    if (sortKey !== col)
      return <ChevronUp className="w-3 h-3 opacity-20 inline ml-0.5" />
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ChevronDown className="w-3 h-3 inline ml-0.5" />
    )
  }

  // Returns YYYY-MM-DD for a date offset by `days` from today
  const offsetDate = (days) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toISOString().slice(0, 10)
  }

  const PRESETS = [
    {
      label: "Last 7 Days",
      key: "7d",
      from: () => offsetDate(-6),
      to: () => offsetDate(0),
    },
    {
      label: "Last 4 Weeks",
      key: "4w",
      from: () => offsetDate(-27),
      to: () => offsetDate(0),
    },
    {
      label: "Last 3 Months",
      key: "3m",
      from: () => offsetDate(-89),
      to: () => offsetDate(0),
    },
    {
      label: "Last 6 Months",
      key: "6m",
      from: () => offsetDate(-179),
      to: () => offsetDate(0),
    },
    {
      label: "Last 1 Year",
      key: "1y",
      from: () => offsetDate(-364),
      to: () => offsetDate(0),
    },
  ]

  const applyPreset = (preset) => {
    setActivePreset(preset.key)
    setDateFrom(preset.from())
    setDateTo(preset.to())
  }

  const clearFilters = () => {
    setDateFrom("")
    setDateTo("")
    setTimeFrom("")
    setTimeTo("")
    setStudentStatus("all")
    setActivePreset("")
  }

  const selectedClass = classes.find((c) => String(c.id) === selectedClassId)
  const csvLabel = selectedClass
    ? selectedClass.class_code ||
      selectedClass.subject_name ||
      selectedClass.class_name
    : "class"

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
          {/* Header + class selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Class Analytics
                </h1>
                <p className="text-sm text-gray-500">
                  Attendance insights per class
                </p>
              </div>
              {trendDirection && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                    trendDirection === "up"
                      ? "bg-green-100 text-green-700"
                      : trendDirection === "down"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {trendDirection === "up" && (
                    <TrendingUp className="w-3 h-3" />
                  )}
                  {trendDirection === "down" && (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {trendDirection === "up"
                    ? "Improving"
                    : trendDirection === "down"
                      ? "Declining"
                      : "Stable"}
                </span>
              )}
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

          {/* Filter bar */}
          {overview && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              {/* Quick preset buttons */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs font-medium text-gray-400 self-center mr-1">
                  Quick:
                </span>
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => applyPreset(p)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                      activePreset === p.key
                        ? "bg-black text-white border-black"
                        : "bg-white text-gray-600 border-gray-300 hover:border-gray-500 hover:text-gray-900"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Manual date inputs + student status + clear */}
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500">
                    Date From
                  </label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value)
                      setActivePreset("")
                    }}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500">
                    Date To
                  </label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => {
                      setDateTo(e.target.value)
                      setActivePreset("")
                    }}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500">
                    Time From
                  </label>
                  <input
                    type="time"
                    value={timeFrom}
                    onChange={(e) => {
                      setTimeFrom(e.target.value)
                      setActivePreset("")
                    }}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500">
                    Time To
                  </label>
                  <input
                    type="time"
                    value={timeTo}
                    onChange={(e) => {
                      setTimeTo(e.target.value)
                      setActivePreset("")
                    }}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500">
                    Student Status
                  </label>
                  <select
                    value={studentStatus}
                    onChange={(e) => setStudentStatus(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="all">All Students</option>
                    <option value="at_risk">At Risk Only</option>
                    <option value="good">Good Standing Only</option>
                  </select>
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-2"
                  >
                    <X className="w-3 h-3" /> Clear Filters
                  </button>
                )}
              </div>
            </div>
          )}

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

          {!loading && filteredOverview && (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Class Attendance Rate"
                  value={`${filteredOverview.avg_attendance_rate}%`}
                  sub="Average across filtered sessions · Late counts as attended"
                  icon={TrendingUp}
                  color="blue"
                />
                <StatCard
                  label="Sessions Held"
                  value={filteredOverview.total_sessions}
                  sub={
                    dateFrom || dateTo || timeFrom || timeTo
                      ? "Filtered sessions"
                      : "Ended sessions"
                  }
                  icon={Calendar}
                  color="gray"
                />
                <StatCard
                  label="Students Enrolled"
                  value={filteredOverview.total_enrolled}
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
                  value={`${filteredOverview.best_session_rate}%`}
                  sub="Best performing session"
                  icon={Award}
                  color="green"
                />
                <StatCard
                  label="Lowest Session Rate"
                  value={`${filteredOverview.worst_session_rate}%`}
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
                        {filteredOverview.total_present}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Late</p>
                      <p className="text-xl font-bold text-yellow-500">
                        {filteredOverview.total_late}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Absent</p>
                      <p className="text-xl font-bold text-red-500">
                        {filteredOverview.total_absent}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts */}
              {(filteredTrend.length > 0 ||
                filteredOverview.total_present +
                  filteredOverview.total_late +
                  filteredOverview.total_absent >
                  0) && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {filteredTrend.length > 0 && (
                    <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
                      <h2 className="text-base font-semibold text-gray-900 mb-1">
                        Session-by-Session Trend
                      </h2>
                      <p className="text-xs text-gray-400 mb-4">
                        Present / Late / Absent counts (bars) + Attendance Rate
                        % (line)
                      </p>
                      <ResponsiveContainer width="100%" height={240}>
                        <ComposedChart
                          data={composedData}
                          margin={{ top: 4, right: 30, left: -20, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#f0f0f0"
                          />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis
                            yAxisId="left"
                            allowDecimals={false}
                            tick={{ fontSize: 11 }}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            domain={[0, 100]}
                            tickFormatter={(v) => `${v}%`}
                            tick={{ fontSize: 11 }}
                          />
                          <Tooltip
                            formatter={(v, name) =>
                              name === "Rate %" ? `${v}%` : v
                            }
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar
                            yAxisId="left"
                            dataKey="Present"
                            fill="#22c55e"
                            radius={[3, 3, 0, 0]}
                          />
                          <Bar
                            yAxisId="left"
                            dataKey="Late"
                            fill="#eab308"
                            radius={[3, 3, 0, 0]}
                          />
                          <Bar
                            yAxisId="left"
                            dataKey="Absent"
                            fill="#ef4444"
                            radius={[3, 3, 0, 0]}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="Rate %"
                            stroke="#6366f1"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {filteredOverview.total_present +
                    filteredOverview.total_late +
                    filteredOverview.total_absent >
                    0 && (
                    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col">
                      <h2 className="text-base font-semibold text-gray-900 mb-1">
                        Overall Breakdown
                      </h2>
                      <p className="text-xs text-gray-400 mb-4">
                        All sessions combined
                      </p>
                      <div className="flex-1 flex items-center justify-center">
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {pieData.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v, name) => [`${v}`, name]} />
                            <Legend
                              iconType="circle"
                              wrapperStyle={{ fontSize: 12 }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {filteredTrend.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
                  <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">
                    {dateFrom || dateTo
                      ? "No sessions found in the selected date range."
                      : "No ended sessions yet for this class."}
                  </p>
                </div>
              )}

              {/* Student breakdown table */}
              {allStudents.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-base font-semibold text-gray-900">
                      Student Attendance Summary
                    </h2>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">
                        {filteredStudents.length} of {allStudents.length}{" "}
                        students
                      </span>
                      <button
                        onClick={() =>
                          exportCsv(
                            filteredStudents,
                            csvLabel,
                            filteredTrend,
                            recordsBySession,
                          )
                        }
                        className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
                      >
                        <Download className="w-3 h-3" /> Export CSV
                      </button>
                      <button
                        onClick={() =>
                          exportPdf(
                            filteredStudents,
                            csvLabel,
                            filteredTrend,
                            recordsBySession,
                            filteredOverview,
                            dateFrom,
                            dateTo,
                          )
                        }
                        className="flex items-center gap-1 text-xs text-white bg-gray-800 hover:bg-black rounded-lg px-2.5 py-1.5"
                      >
                        <Download className="w-3 h-3" /> Export PDF
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">
                    Each student's attendance record · Click a row to see
                    per-session check-in times · Click column headers to sort
                  </p>
                  {filteredStudents.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">
                      No students match the selected filter.
                    </p>
                  ) : (
                    <div className="overflow-x-auto overflow-y-auto max-h-[28rem]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 border-b">
                            {[
                              { key: "student_name", label: "Student" },
                              { key: "student_id", label: "ID" },
                              {
                                key: "present",
                                label: "Present",
                                cls: "text-green-600",
                              },
                              {
                                key: "late",
                                label: "Late",
                                cls: "text-yellow-600",
                              },
                              {
                                key: "absent",
                                label: "Absent",
                                cls: "text-red-500",
                              },
                              { key: "attendance_rate", label: "Rate" },
                            ].map(({ key, label, cls }) => (
                              <th
                                key={key}
                                className={`pb-2 pr-4 cursor-pointer select-none hover:text-gray-800 ${cls || ""}`}
                                onClick={() => handleSort(key)}
                              >
                                {label}
                                <SortIcon col={key} />
                              </th>
                            ))}
                            <th className="pb-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredStudents.map((s) => {
                            const isExpanded = expandedStudentId === s.id
                            const sessionRows = filteredTrend.map(
                              (session, i) => {
                                const rec =
                                  recordsBySession[session.session_id]?.[s.id]
                                return {
                                  idx: i + 1,
                                  session_id: session.session_id,
                                  label: session.label,
                                  status: rec?.status || "absent",
                                  checked_in_at: rec?.checked_in_at || null,
                                }
                              },
                            )
                            return (
                              <>
                                <tr
                                  key={s.id}
                                  onClick={() =>
                                    setExpandedStudentId(
                                      isExpanded ? null : s.id,
                                    )
                                  }
                                  className={`cursor-pointer transition ${
                                    s.at_risk
                                      ? "bg-red-50 hover:bg-red-100"
                                      : "hover:bg-gray-50"
                                  }`}
                                >
                                  <td className="py-2 pr-4 font-medium">
                                    <span className="inline-flex items-center gap-1">
                                      {isExpanded ? (
                                        <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" />
                                      ) : (
                                        <ChevronUp className="w-3 h-3 text-gray-400 shrink-0 -rotate-90" />
                                      )}
                                      {toTitleCase(s.student_name)}
                                    </span>
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
                                {isExpanded && (
                                  <tr key={`${s.id}-expand`}>
                                    <td colSpan={7} className="pb-3 pt-0 px-2">
                                      <div className="rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="text-left text-gray-400 border-b border-gray-200 bg-gray-100">
                                              <th className="px-3 py-2 font-medium">
                                                #
                                              </th>
                                              <th className="px-3 py-2 font-medium">
                                                Session Date
                                              </th>
                                              <th className="px-3 py-2 font-medium">
                                                Check-in Time
                                              </th>
                                              <th className="px-3 py-2 font-medium">
                                                Status
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {sessionRows.map((sr) => (
                                              <tr
                                                key={sr.session_id}
                                                className="border-b border-gray-100 last:border-0"
                                              >
                                                <td className="px-3 py-1.5 text-gray-400">
                                                  {sr.idx}
                                                </td>
                                                <td className="px-3 py-1.5 text-gray-600">
                                                  {sr.label}
                                                </td>
                                                <td className="px-3 py-1.5 text-gray-600">
                                                  {sr.checked_in_at ?? (
                                                    <span className="text-gray-300">
                                                      —
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="px-3 py-1.5">
                                                  {sr.status === "present" && (
                                                    <span className="text-green-600 font-semibold">
                                                      Present
                                                    </span>
                                                  )}
                                                  {sr.status === "late" && (
                                                    <span className="text-yellow-600 font-semibold">
                                                      Late
                                                    </span>
                                                  )}
                                                  {sr.status === "absent" && (
                                                    <span className="text-red-500 font-semibold">
                                                      Absent
                                                    </span>
                                                  )}
                                                </td>
                                              </tr>
                                            ))}
                                            {sessionRows.length === 0 && (
                                              <tr>
                                                <td
                                                  colSpan={4}
                                                  className="px-3 py-3 text-gray-400 text-center"
                                                >
                                                  No sessions in selected range.
                                                </td>
                                              </tr>
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {!loading && !filteredOverview && !error && selectedClassId && (
            <div className="text-center py-16 text-gray-400 text-sm">
              No data available.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
