import { User, QrCode } from "lucide-react"
import { useEffect, useState } from "react"
import axios from "axios"
import QRScannerModal from "./QRScannerModal"
import CheckInSuccessModal from "@/Components/modals/CheckInSuccessModal"
import {
  authApiUrl,
  attendanceApiUrl,
  teacherClassApiUrl,
} from "@/lib/nativeApi"
import { useNavigate } from "react-router-dom"
import Header from "./DashboardUI/Header"

export default function StudentDashboard() {
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [enrolledClasses, setEnrolledClasses] = useState(0)
  const [attendanceRate, setAttendanceRate] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showQRScanner, setShowQRScanner] = useState(false)
  const [successModal, setSuccessModal] = useState({
    open: false,
    details: {},
  })

  useEffect(() => {
    Promise.all([
      axios.get(authApiUrl("current_student"), { withCredentials: true }),
      axios
        .get(teacherClassApiUrl({ action: "my_classes" }), {
          withCredentials: true,
        })
        .catch(() => ({ data: { classes: [] } })),
      axios
        .get(attendanceApiUrl("student_history"), {
          withCredentials: true,
        })
        .catch(() => ({ data: { records: [] } })),
    ])
      .then(([studentRes, classesRes, historyRes]) => {
        const s = studentRes.data?.student
        if (!s) {
          navigate("/", { replace: true })
          return
        }
        setStudent(s)
        window.__nativeStudentId = s.student_id
        window.localStorage.setItem("nativeStudentId", s.student_id)

        const classes = classesRes.data?.classes || []
        setEnrolledClasses(classes.length)

        const records = historyRes.data?.records || []
        if (records.length > 0) {
          const presentOrLate = records.filter(
            (r) => r.status === "present" || r.status === "late",
          ).length
          setAttendanceRate(Math.round((presentOrLate / records.length) * 100))
        }
      })
      .catch(() => {
        navigate("/", { replace: true })
      })
      .finally(() => setLoading(false))
  }, [navigate])

  const handleScanSuccess = (details) => {
    if (!student) return
    setShowQRScanner(false)
    setSuccessModal({
      open: true,
      details: {
        ...details,
        studentName:
          details.studentName || `${student.first_name} ${student.last_name}`,
        studentId: details.studentId || student.student_id,
      },
    })
  }

  const handleSuccessClose = () => setSuccessModal({ open: false, details: {} })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 student-shell">
        <Header active="dashboard" />

        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Welcome! {student.first_name} {student.last_name}
                </h2>
                <p className="text-sm text-gray-500">
                  Student ID: {student.student_id}
                </p>
              </div>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => navigate("/student/my-classes")}
              className="bg-white rounded-2xl border border-gray-200 p-6 hover:bg-gray-50 transition-colors text-left"
            >
              <p className="text-sm text-gray-600 mb-2">Enrolled Classes</p>
              <p className="text-4xl font-bold text-gray-900">
                {enrolledClasses}
              </p>
              <p className="text-xs text-gray-500 mt-2">Tap to view →</p>
            </button>
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <p className="text-sm text-gray-600 mb-2">Attendance Rate</p>
              <p className="text-4xl font-bold text-gray-900">
                {attendanceRate}%
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-2xl mb-4">
              <QrCode className="w-8 h-8 text-gray-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Ready to Check In?
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Scan your teacher's QR code to mark your attendance
            </p>
            <button
              onClick={() => setShowQRScanner(true)}
              className="w-full max-w-sm mx-auto px-6 py-4 bg-black text-white text-base font-semibold rounded-full hover:bg-gray-800 transition-colors"
            >
              SCAN TO CHECK-IN
            </button>
          </div>
        </main>
      </div>

      <QRScannerModal
        open={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onSuccess={handleScanSuccess}
      />

      <CheckInSuccessModal
        open={successModal.open}
        onClose={handleSuccessClose}
        details={successModal.details}
        onBackToDashboard={handleSuccessClose}
      />
    </>
  )
}
