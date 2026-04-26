import {
  BookOpen,
  User,
  Clock,
  Calendar,
  Users,
  LogOut,
  Plus,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { authApiUrl, teacherClassApiUrl } from "@/lib/nativeApi"
import { ConfirmModal } from "@/Components/ui/AppModals"
import { toast } from "@/lib/toast"
import Header from "./DashboardUI/Header"

export default function StudentMyClasses() {
  const navigate = useNavigate()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmId, setConfirmId] = useState(null)
  const [unenrolling, setUnenrolling] = useState(false)

  // Enroll by code modal state
  const [showEnrollModal, setShowEnrollModal] = useState(false)
  const [enrollCode, setEnrollCode] = useState("")
  const [enrolling, setEnrolling] = useState(false)

  useEffect(() => {
    axios
      .get(authApiUrl("current_student"), { withCredentials: true })
      .then((res) => {
        if (!res.data?.student) {
          navigate("/", { replace: true })
          return null
        }

        return axios.get(teacherClassApiUrl({ action: "my_classes" }), {
          withCredentials: true,
        })
      })
      .then((res) => {
        if (res) {
          setClasses(res.data?.classes || [])
        }
      })
      .catch((err) => {
        if (err?.response?.status === 401) navigate("/", { replace: true })
      })
      .finally(() => setLoading(false))
  }, [navigate])

  const handleUnenroll = async (classId) => {
    if (!classId || unenrolling) return
    const targetClass = classes.find((c) => Number(c.id) === Number(classId))
    const classLabel =
      targetClass?.class_code ||
      targetClass?.subject_name ||
      targetClass?.class_name ||
      "this class"

    setUnenrolling(true)
    try {
      await axios.delete(
        teacherClassApiUrl({ action: "unenroll", class_id: classId }),
        { withCredentials: true },
      )
      setClasses((prev) => prev.filter((c) => c.id !== classId))
      setConfirmId(null)
      toast.success(
        "Unenrolled",
        `You have been unenrolled from ${classLabel}.`,
      )
    } catch (err) {
      toast.error(
        "Failed to Unenroll",
        err?.response?.data?.message || "Failed to unenroll. Please try again.",
      )
    } finally {
      setUnenrolling(false)
    }
  }

  const refreshClasses = () => {
    axios
      .get(teacherClassApiUrl({ action: "my_classes" }), {
        withCredentials: true,
      })
      .then((res) => setClasses(res.data?.classes || []))
      .catch(console.error)
  }

  const handleEnroll = async (e) => {
    e.preventDefault()
    if (!enrollCode.trim() || enrolling) return
    setEnrolling(true)
    try {
      const res = await axios.post(
        teacherClassApiUrl({ action: "enroll_by_code" }),
        { enrollment_code: enrollCode.trim() },
        { withCredentials: true },
      )
      const cls = res.data?.class
      const label = cls?.class_code || cls?.subject_name || "the class"
      toast.success("Enrolled!", `You have been enrolled in ${label}.`)
      setShowEnrollModal(false)
      setEnrollCode("")
      refreshClasses()
    } catch (err) {
      toast.error(
        "Enrollment Failed",
        err?.response?.data?.message ||
          "Invalid enrollment code. Please try again.",
      )
    } finally {
      setEnrolling(false)
    }
  }

  const selectedClass = classes.find((c) => Number(c.id) === Number(confirmId))

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 student-shell">
      <Header active="classes" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                My Enrolled Classes
              </h1>
              <p className="text-sm text-gray-500">View all your classes</p>
            </div>
            <button
              onClick={() => {
                setShowEnrollModal(true)
                setEnrollCode("")
              }}
              className="flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" /> Join Class
            </button>
          </div>
        </div>

        {classes.length > 0 ? (
          <div className="space-y-4">
            {classes.map((classItem) => (
              <div
                key={classItem.id}
                className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          {classItem.class_code}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {classItem.subject_name ||
                            classItem.class_name ||
                            "No subject name"}
                        </p>
                      </div>
                    </div>
                    {classItem.teacher && (
                      <div className="flex items-center gap-2 mt-3 text-sm text-gray-600">
                        <User className="w-4 h-4" />
                        <span>
                          {classItem.teacher.first_name}{" "}
                          {classItem.teacher.last_name}
                        </span>
                      </div>
                    )}
                    {classItem.schedule && (
                      <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                        <Clock className="w-4 h-4" />
                        <span>{classItem.schedule}</span>
                      </div>
                    )}
                    {classItem.room && (
                      <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                        <Calendar className="w-4 h-4" />
                        <span>Room: {classItem.room}</span>
                      </div>
                    )}

                    <button
                      onClick={() => setConfirmId(classItem.id)}
                      className="mt-4 flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Unenroll
                    </button>

                    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        <Users className="w-4 h-4" />
                        <span>
                          Classmates ({classItem.classmate_count || 0})
                        </span>
                      </div>

                      {Array.isArray(classItem.classmates) &&
                      classItem.classmates.length > 0 ? (
                        <>
                          <ul className="mt-2 space-y-1">
                            {classItem.classmates
                              .slice(0, 8)
                              .map((classmate, index) => (
                                <li
                                  key={`${classItem.id}-${classmate.student_id || index}`}
                                  className="text-sm text-gray-700"
                                >
                                  {classmate.first_name} {classmate.last_name}
                                </li>
                              ))}
                          </ul>

                          {classItem.classmates.length > 8 && (
                            <p className="mt-2 text-xs text-gray-500">
                              +{classItem.classmates.length - 8} more
                              classmate(s)
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-gray-500">
                          No other classmates listed yet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Classes Enrolled
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              You haven't enrolled in any classes yet.
            </p>
            <button
              onClick={() => {
                setShowEnrollModal(true)
                setEnrollCode("")
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" /> Join a Class
            </button>
          </div>
        )}
      </main>

      <ConfirmModal
        open={confirmId !== null}
        title="Unenroll from Class"
        message={
          selectedClass
            ? `Are you sure you want to unenroll from ${selectedClass.class_code}? You can rejoin only with a valid class code.`
            : "Are you sure you want to unenroll from this class?"
        }
        confirmLabel={unenrolling ? "Unenrolling..." : "Unenroll"}
        cancelLabel="Cancel"
        danger={true}
        onCancel={() => {
          if (unenrolling) return
          setConfirmId(null)
        }}
        onConfirm={() => {
          if (confirmId === null || unenrolling) return
          handleUnenroll(confirmId)
        }}
      />

      {/* Enroll by code modal */}
      {showEnrollModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[9000]"
            onClick={() => {
              if (!enrolling) {
                setShowEnrollModal(false)
              }
            }}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[9001] pointer-events-none px-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl pointer-events-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                  Join a Class
                </h3>
                <button
                  onClick={() => {
                    if (!enrolling) {
                      setShowEnrollModal(false)
                    }
                  }}
                  className="text-gray-400 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Enter the enrollment code given by your teacher.
              </p>
              <form onSubmit={handleEnroll} className="space-y-3">
                <input
                  type="text"
                  value={enrollCode}
                  onChange={(e) => {
                    setEnrollCode(e.target.value)
                  }}
                  placeholder="Enter enrollment code"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  disabled={enrolling}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!enrollCode.trim() || enrolling}
                  className="w-full py-3 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {enrolling ? "Enrolling..." : "Join Class"}
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
