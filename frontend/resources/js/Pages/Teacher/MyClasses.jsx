import { useState, useEffect } from "react"
import { Button } from "@/Components/ui/button"
import ClassCard from "./MyClassesUI/ClassCard"
import CreateClassModal from "./MyClassesUI/CreateClassModal"
import EditClassModal from "./MyClassesUI/EditClassModal"
import DeleteClassModal from "./MyClassesUI/DeleteClassModal"
import QRCodeModal from "./MyClasses/QRCodeModal"
import ViewStudentsModal from "./MyClasses/ViewStudentsModal"
import LiveAttendanceModal from "./MyClassesUI/LiveAttendanceModal"
import Header from "./DashboardUI/Header"
import { SuccessModal, ErrorModal } from "@/Components/ui/AppModals"
import axios from "axios"
import { teacherClassApiUrl } from "@/lib/nativeApi"
import { useNavigate } from "react-router-dom"

export default function MyClasses() {
  const navigate = useNavigate()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isQRModalOpen, setIsQRModalOpen] = useState(false)
  const [isViewStudentsModalOpen, setIsViewStudentsModalOpen] = useState(false)
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false)
  const [selectedClass, setSelectedClass] = useState(null)
  const [enrolledStudents, setEnrolledStudents] = useState([])
  const [successModal, setSuccessModal] = useState({
    open: false,
    message: "",
  })
  const [errorModal, setErrorModal] = useState({ open: false, message: "" })

  const fetchClasses = () => {
    axios
      .get(teacherClassApiUrl(), { withCredentials: true })
      .then((res) => setClasses(res.data?.classes || []))
      .catch((err) => {
        if (err?.response?.status === 401) navigate("/", { replace: true })
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchClasses()
  }, [navigate])

  const handleEdit = (classItem) => {
    setSelectedClass(classItem)
    setIsEditModalOpen(true)
  }
  const handleDelete = (classItem) => {
    setSelectedClass(classItem)
    setIsDeleteModalOpen(true)
  }
  const handleShowQR = (classItem) => {
    setSelectedClass(classItem)
    setIsQRModalOpen(true)
  }
  const handleStartAttendance = (classItem) => {
    setSelectedClass(classItem)
    setIsAttendanceModalOpen(true)
  }

  const handleViewStudents = async (classItem) => {
    setSelectedClass(classItem)
    try {
      const response = await axios.get(
        teacherClassApiUrl({ action: "students", id: classItem.id }),
        { withCredentials: true },
      )
      setEnrolledStudents(response.data.students || [])
      setIsViewStudentsModalOpen(true)
    } catch (error) {
      console.error("Error fetching students:", error)
      setErrorModal({
        open: true,
        message:
          error?.response?.data?.message || "Failed to load enrolled students.",
      })
    }
  }

  const confirmDelete = async () => {
    if (!selectedClass?.id) return
    const deletingClassCode = selectedClass.class_code

    try {
      await axios.delete(teacherClassApiUrl({ id: selectedClass.id }), {
        withCredentials: true,
      })
      setIsDeleteModalOpen(false)
      setSelectedClass(null)
      fetchClasses()
      setSuccessModal({
        open: true,
        message: `${deletingClassCode} has been deleted successfully.`,
      })
    } catch (error) {
      setIsDeleteModalOpen(false)
      setErrorModal({
        open: true,
        message: error?.response?.data?.message || "Failed to delete class.",
      })
    }
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
      <Header active="classes" />

      <div className="min-h-screen bg-gray-100 py-6 teacher-shell">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
            <h1 className="text-2xl font-bold">My Classes</h1>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-black hover:bg-gray-900 text-white w-full sm:w-auto"
            >
              + Create New Class
            </Button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
            {classes.map((classItem) => (
              <ClassCard
                key={classItem.id}
                classItem={classItem}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onShowQR={handleShowQR}
                onViewStudents={handleViewStudents}
                onStartAttendance={handleStartAttendance}
              />
            ))}
          </div>
        </div>
      </div>

      <CreateClassModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false)
          fetchClasses()
        }}
      />
      <EditClassModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedClass(null)
          fetchClasses()
        }}
        classItem={selectedClass}
      />
      <DeleteClassModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false)
          setSelectedClass(null)
        }}
        classItem={selectedClass}
        onConfirm={confirmDelete}
      />
      <QRCodeModal
        isOpen={isQRModalOpen}
        onClose={() => {
          setIsQRModalOpen(false)
          setSelectedClass(null)
        }}
        classItem={selectedClass}
      />
      <ViewStudentsModal
        isOpen={isViewStudentsModalOpen}
        onClose={() => {
          setIsViewStudentsModalOpen(false)
          setSelectedClass(null)
          setEnrolledStudents([])
        }}
        classItem={selectedClass}
        students={enrolledStudents}
      />
      <LiveAttendanceModal
        isOpen={isAttendanceModalOpen}
        onClose={() => {
          setIsAttendanceModalOpen(false)
          setSelectedClass(null)
        }}
        classData={selectedClass}
      />

      <SuccessModal
        open={successModal.open}
        title="Action Completed"
        message={successModal.message}
        onClose={() => setSuccessModal({ open: false, message: "" })}
      />
      <ErrorModal
        open={errorModal.open}
        title="Action Failed"
        message={errorModal.message}
        onClose={() => setErrorModal({ open: false, message: "" })}
      />
    </>
  )
}
