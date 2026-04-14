import { useState, useEffect, useMemo } from "react"
import Header from "./DashboardUI/Header"
import WelcomeSection from "./DashboardUI/WelcomeSection"
import StatsGrid from "./DashboardUI/StatsGrid"
import TodayClasses from "./DashboardUI/TodayClasses"
import LiveAttendanceModal from "./MyClassesUI/LiveAttendanceModal"
import axios from "axios"
import { authApiUrl, attendanceApiUrl } from "@/lib/nativeApi"
import { useNavigate } from "react-router-dom"

const DEFAULT_STATS = {
  classesToday: 0,
  totalStudents: 0,
  presentToday: 0,
  absentToday: 0,
  classes: [],
}

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const [teacher, setTeacher] = useState(null)
  const [stats, setStats] = useState(DEFAULT_STATS)
  const [loading, setLoading] = useState(true)
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false)
  const [selectedClass, setSelectedClass] = useState(null)
  const [filterClassId, setFilterClassId] = useState("all")

  const filteredStats = useMemo(() => {
    if (filterClassId === "all") return stats

    const selected = stats.classes.find((c) => c.id.toString() === filterClassId)
    if (!selected) return stats

    return {
      classesToday: selected.status ? 1 : 0,
      totalStudents: selected.total || 0,
      presentToday: selected.present || 0,
      absentToday: selected.absent || 0,
      classes: [selected],
    }
  }, [stats, filterClassId])

  useEffect(() => {
    Promise.all([
      axios.get(authApiUrl("current_teacher"), { withCredentials: true }),
      axios.get(attendanceApiUrl("dashboard"), { withCredentials: true }),
    ])
      .then(([teacherRes, statsRes]) => {
        setTeacher(teacherRes.data?.teacher ?? null)
        const s = statsRes.data
        setStats({
          classesToday: s.classesToday ?? 0,
          totalStudents: s.totalStudents ?? 0,
          presentToday: s.presentToday ?? 0,
          absentToday: s.absentToday ?? 0,
          classes: s.classes ?? [],
        })
      })
      .catch((err) => {
        if (err?.response?.status === 401) {
          navigate("/", { replace: true })
        }
      })
      .finally(() => setLoading(false))
  }, [navigate])

  useEffect(() => {
    if (!stats.classes.length) return
    const activeClass = stats.classes.find(
      (c) => c.status === "active" && c.active_session_id,
    )
    if (activeClass && !isAttendanceModalOpen) {
      setSelectedClass(activeClass)
      setIsAttendanceModalOpen(true)
    }
  }, [stats.classes])

  const hasActiveSession = stats.classes.some(
    (c) => c.status === "active" && c.active_session_id,
  )

  const handleStartAttendance = (classItem) => {
    setSelectedClass(classItem)
    setIsAttendanceModalOpen(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-gray-100 teacher-shell">
        <Header active="dashboard" />
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <WelcomeSection
            teacherFirstName={teacher?.first_name}
            teacherMiddleName={teacher?.middle_name}
            teacherLastName={teacher?.last_name}
          />
          
          <div className="mb-4 flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-lg shadow-sm">
            <h2 className="text-lg font-semibold text-gray-800 mb-2 sm:mb-0">Dashboard Overview</h2>
            <select
              value={filterClassId}
              onChange={(e) => setFilterClassId(e.target.value)}
              className="mt-1 block w-full sm:w-64 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-[#0b2b46] focus:border-[#0b2b46] sm:text-sm rounded-md"
            >
              <option value="all">All Classes</option>
              {stats.classes.map((c) => (
                <option key={c.id} value={c.id.toString()}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </div>

          <StatsGrid stats={filteredStats} />
          <TodayClasses
            classes={filteredStats.classes}
            onStartAttendance={handleStartAttendance}
          />
        </main>
      </div>
      <LiveAttendanceModal
        isOpen={isAttendanceModalOpen}
        onClose={(shouldClose) => {
          if (shouldClose === false) {
            setIsAttendanceModalOpen(false)
            return
          }
          setIsAttendanceModalOpen(false)
          setSelectedClass(null)
        }}
        classData={selectedClass}
      />
    </>
  )
}
