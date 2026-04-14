import { Button } from "@/Components/ui/button"
import { Card } from "@/Components/ui/card"
import { Edit, Trash2, Eye, Radio } from "lucide-react"
import { useState, useEffect } from "react"
import axios from "axios"

import { teacherClassApiUrl } from "@/lib/nativeApi"

export default function ClassCard({
  classItem,
  onEdit,
  onDelete,
  onShowQR,
  onViewStudents,
  onStartAttendance,
}) {
  const [studentsCount, setStudentsCount] = useState(
    classItem.students_enrolled || 0,
  )

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const studentsResponse = await axios.get(
          teacherClassApiUrl({
            action: "students",
            id: classItem.id,
          }),
          { withCredentials: true },
        )
        setStudentsCount((studentsResponse.data.students || []).length)
      } catch (error) {
        setStudentsCount(classItem.students_enrolled || 0)
      }
    }

    fetchStudents()
    const interval = setInterval(fetchStudents, 10000)
    return () => clearInterval(interval)
  }, [classItem.id])

  return (
    <Card className="p-4 sm:p-6 bg-white">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold break-words">
              {classItem.class_code}
            </h2>
          </div>
          <p className="text-gray-600">{classItem.subject_name}</p>
          <p className="text-sm text-gray-500 mt-2">{classItem.schedule}</p>
          {classItem.room && (
            <p className="text-sm text-gray-500">Room: {classItem.room}</p>
          )}
        </div>

        <div className="flex items-center gap-1 self-end sm:self-auto shrink-0">
          <div className="flex flex-col items-center">
            <Button
              variant="ghost"
              className="h-8 w-8 p-1"
              onClick={() => onViewStudents(classItem)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <span className="text-xs text-gray-400">Students</span>
          </div>
          <div className="flex flex-col items-center">
            <Button
              variant="ghost"
              className="h-8 w-8 p-1"
              onClick={() => onEdit(classItem)}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <span className="text-xs text-gray-400">Edit</span>
          </div>
          <div className="flex flex-col items-center">
            <Button
              variant="ghost"
              className="h-8 w-8 p-1 text-red-500 hover:text-red-700"
              onClick={() => onDelete(classItem)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <span className="text-xs text-red-400">Delete</span>
          </div>
        </div>
      </div>

      <div className="flex items-center text-sm text-gray-600 mb-4">
        <svg
          className="w-5 h-5 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        <span>{studentsCount} Students Enrolled</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => onShowQR(classItem)}
        >
          Registration QR
        </Button>
        <Button
          className="w-full bg-black hover:bg-gray-900 text-white"
          onClick={() => onStartAttendance(classItem)}
        >
          <Radio className="w-4 h-4 mr-2" />
          Start Attendance
        </Button>
      </div>
    </Card>
  )
}
