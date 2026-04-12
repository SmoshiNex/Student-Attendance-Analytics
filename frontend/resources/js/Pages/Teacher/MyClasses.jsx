import { useState, useEffect } from "react";
import { Button } from "@/Components/ui/button";
import ClassCard from "./MyClassesUI/ClassCard";
import CreateClassModal from "./MyClassesUI/CreateClassModal";
import EditClassModal from "./MyClassesUI/EditClassModal";
import DeleteClassModal from "./MyClassesUI/DeleteClassModal";
import QRCodeModal from "./MyClasses/QRCodeModal";
import ViewStudentsModal from "./MyClasses/ViewStudentsModal";
import LiveAttendanceModal from "./MyClassesUI/LiveAttendanceModal";
import Header from "./DashboardUI/Header";
import axios from "axios";
import { teacherClassApiUrl } from "@/lib/nativeApi";
import { useNavigate } from "react-router-dom";

export default function MyClasses() {
    const navigate = useNavigate();
    const [classes, setClasses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isQRModalOpen, setIsQRModalOpen] = useState(false);
    const [isViewStudentsModalOpen, setIsViewStudentsModalOpen] =
        useState(false);
    const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
    const [selectedClass, setSelectedClass] = useState(null);
    const [enrolledStudents, setEnrolledStudents] = useState([]);

    const fetchClasses = () => {
        axios
            .get(teacherClassApiUrl(), { withCredentials: true })
            .then((res) => setClasses(res.data?.classes || []))
            .catch(() => {
                navigate("/", { replace: true });
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchClasses();
    }, [navigate]);

    const handleEdit = (classItem) => {
        setSelectedClass(classItem);
        setIsEditModalOpen(true);
    };
    const handleDelete = (classItem) => {
        setSelectedClass(classItem);
        setIsDeleteModalOpen(true);
    };
    const handleShowQR = (classItem) => {
        setSelectedClass(classItem);
        setIsQRModalOpen(true);
    };
    const handleStartAttendance = (classItem) => {
        setSelectedClass(classItem);
        setIsAttendanceModalOpen(true);
    };

    const handleViewStudents = async (classItem) => {
        setSelectedClass(classItem);
        try {
            const response = await axios.get(
                teacherClassApiUrl({ action: "students", id: classItem.id }),
                { withCredentials: true },
            );
            setEnrolledStudents(response.data.students || []);
            setIsViewStudentsModalOpen(true);
        } catch (error) {
            console.error("Error fetching students:", error);
        }
    };

    const confirmDelete = async () => {
        if (!selectedClass?.id) return;
        try {
            await axios.delete(teacherClassApiUrl({ id: selectedClass.id }), {
                withCredentials: true,
            });
            setIsDeleteModalOpen(false);
            setSelectedClass(null);
            fetchClasses();
        } catch (error) {
            alert(error?.response?.data?.message || "Failed to delete class");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-gray-500">Loading...</p>
            </div>
        );
    }

    return (
        <>
            <Header active="classes" />

            <div className="min-h-screen bg-gray-100 py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold">My Classes</h1>
                        <Button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="bg-black hover:bg-gray-900 text-white"
                        >
                            + Create New Class
                        </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
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
                    setIsCreateModalOpen(false);
                    fetchClasses();
                }}
            />
            <EditClassModal
                isOpen={isEditModalOpen}
                onClose={() => {
                    setIsEditModalOpen(false);
                    setSelectedClass(null);
                    fetchClasses();
                }}
                classItem={selectedClass}
            />
            <DeleteClassModal
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setSelectedClass(null);
                }}
                classItem={selectedClass}
                onConfirm={confirmDelete}
            />
            <QRCodeModal
                isOpen={isQRModalOpen}
                onClose={() => {
                    setIsQRModalOpen(false);
                    setSelectedClass(null);
                }}
                classItem={selectedClass}
            />
            <ViewStudentsModal
                isOpen={isViewStudentsModalOpen}
                onClose={() => {
                    setIsViewStudentsModalOpen(false);
                    setSelectedClass(null);
                    setEnrolledStudents([]);
                }}
                classItem={selectedClass}
                students={enrolledStudents}
            />
            <LiveAttendanceModal
                isOpen={isAttendanceModalOpen}
                onClose={() => {
                    setIsAttendanceModalOpen(false);
                    setSelectedClass(null);
                }}
                classData={selectedClass}
            />
        </>
    );
}
