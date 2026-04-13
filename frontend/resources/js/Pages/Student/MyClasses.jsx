import { BookOpen, User, Clock, Calendar } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { authApiUrl, teacherClassApiUrl } from "@/lib/nativeApi"
import Header from "./DashboardUI/Header"

export default function StudentMyClasses() {
  const navigate = useNavigate()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)

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
      .catch(() => {
        navigate("/", { replace: true })
      })
      .finally(() => setLoading(false))
  }, [navigate])

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
          <h1 className="text-2xl font-bold text-gray-900">
            My Enrolled Classes
          </h1>
          <p className="text-sm text-gray-500">View all your classes</p>
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
            <p className="text-xs text-gray-400">
              Ask your teacher for a class code to enroll.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
