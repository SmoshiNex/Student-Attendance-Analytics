import { useState, useEffect, useRef } from "react"
import { Button } from "@/Components/ui/button"
import { Download } from "lucide-react"
import ReportsFilters from "@/Components/reports/ReportsFilters"
import ReportsTable from "@/Components/reports/ReportsTable"
import Header from "../DashboardUI/Header"
import axios from "axios"
import { attendanceApiUrl } from "@/lib/nativeApi"
import { useNavigate } from "react-router-dom"

const FILTER_STORAGE_KEY = "reports_filters"
const AUTO_REFRESH_INTERVAL = 5000

export default function ReportsIndex({
  records = [],
  classes = [],
  filters = {},
}) {
  const navigate = useNavigate()
  const safeClasses = Array.isArray(classes) ? classes : []

  const [localRecords, setLocalRecords] = useState([])
  const [localClasses, setLocalClasses] = useState(safeClasses)
  const [localFilters, setLocalFilters] = useState(() =>
    initializeFilters(filters),
  )
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState("")

  const filtersRef = useRef(localFilters)
  const mountedRef = useRef(true)
  const intervalRef = useRef(null)

  // Keep filtersRef in sync
  useEffect(() => {
    filtersRef.current = localFilters
  }, [localFilters])

  // Save filters to localStorage
  useEffect(() => {
    window.localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify(localFilters),
    )
  }, [localFilters])

  // Fetch on mount + start auto-refresh, clean up on unmount
  useEffect(() => {
    mountedRef.current = true
    fetchRecords(filtersRef.current, false)

    intervalRef.current = setInterval(() => {
      fetchRecords(filtersRef.current, true)
    }, AUTO_REFRESH_INTERVAL)

    return () => {
      mountedRef.current = false
      clearInterval(intervalRef.current)
    }
  }, [])

  const fetchRecords = async (currentFilters, silent) => {
    const payload = buildFilterPayload(currentFilters)

    if (!silent && mountedRef.current) setIsLoading(true)

    try {
      const response = await axios.get(attendanceApiUrl("reports"), {
        params: payload,
        withCredentials: true,
      })

      if (!mountedRef.current) return

      const apiData = response?.data || {}
      setLocalRecords(Array.isArray(apiData.records) ? apiData.records : [])
      if (Array.isArray(apiData.classes)) setLocalClasses(apiData.classes)
      setFetchError("")
    } catch (error) {
      if (!mountedRef.current) return

      const statusCode = error?.response?.status
      if (statusCode === 401) {
        clearInterval(intervalRef.current)
        navigate("/", { replace: true })
        return
      }
      if (!silent) {
        setFetchError(
          error?.response?.data?.message ||
            "Unable to load reports. Please try again.",
        )
      }
    } finally {
      if (mountedRef.current && !silent) setIsLoading(false)
    }
  }

  const buildFilterPayload = (f) => {
    const payload = {}
    if (f.class_id && f.class_id !== "all") payload.class_id = f.class_id
    if (f.date && f.date.trim() !== "") payload.date = f.date
    return payload
  }

  const handleClassChange = (value) => {
    const next = { ...filtersRef.current, class_id: value }
    setLocalFilters(next)
    fetchRecords(next, false)
  }

  const handleDateChange = (value) => {
    const next = { ...filtersRef.current, date: value }
    setLocalFilters(next)
    fetchRecords(next, false)
  }

  const clearFilters = () => {
    const cleared = { class_id: "all", date: "" }
    setLocalFilters(cleared)
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(cleared))
    fetchRecords(cleared, false)
  }

  const exportReport = () => {
    const headers = ["Student Name", "Student ID", "Class", "Date", "Status"]
    const rows = localRecords.map((record) => {
      const studentName =
        record.studentName ||
        (record.student
          ? `${record.student.first_name || ""} ${record.student.last_name || ""}`.trim()
          : "") ||
        "Unknown Student"
      const studentId = record.studentId || record.student?.student_id || ""
      const className =
        record.class ||
        (record.session?.teacherClass
          ? `${record.session.teacherClass.class_code || ""}${record.session.teacherClass.subject_name ? ` - ${record.session.teacherClass.subject_name}` : ""}`.trim()
          : "") ||
        "Unknown Class"
      const date = record.date || record.checked_in_at || ""
      const status = (record.status || "").toUpperCase()
      return [studentName, studentId, className, date, status]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(",")
    })

    const csvContent = [headers.join(","), ...rows].join("\n")
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", "attendance-reports.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-100 teacher-shell">
      <Header active="reports" />
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Attendance Reports
          </h1>
          <Button
            onClick={exportReport}
            className="flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>

        <ReportsFilters
          classes={localClasses}
          filters={localFilters}
          onClassChange={handleClassChange}
          onDateChange={handleDateChange}
          onClear={clearFilters}
          isLoading={isLoading}
        />

        {fetchError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {fetchError}
          </div>
        )}

        <ReportsTable records={localRecords} isLoading={isLoading} />
      </main>
    </div>
  )
}

function initializeFilters(serverFilters) {
  try {
    const stored = window.localStorage.getItem(FILTER_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        class_id: parsed.class_id || "all",
        date: parsed.date || "",
      }
    }
  } catch (_) {}

  return {
    class_id: serverFilters.class_id
      ? serverFilters.class_id.toString()
      : "all",
    date: serverFilters.date || "",
  }
}
