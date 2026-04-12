import { User, QrCode, Clock, Bell, Menu, X, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import axios from "axios";
import QRScannerModal from "./QRScannerModal";
import CheckInSuccessModal from "@/Components/modals/CheckInSuccessModal";
import {
    authApiUrl,
    attendanceApiUrl,
    teacherClassApiUrl,
} from "@/lib/nativeApi";
import logoUrl from "@/lib/logo";
import { useNavigate } from "react-router-dom";

export default function StudentDashboard() {
    const navigate = useNavigate();
    const [student, setStudent] = useState(null);
    const [enrolledClasses, setEnrolledClasses] = useState(0);
    const [attendanceRate, setAttendanceRate] = useState(0);
    const [loading, setLoading] = useState(true);
    const [showQRScanner, setShowQRScanner] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [successModal, setSuccessModal] = useState({
        open: false,
        details: {},
    });

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
                const s = studentRes.data?.student;
                if (!s) {
                    navigate("/", { replace: true });
                    return;
                }
                setStudent(s);
                window.__nativeStudentId = s.student_id;
                window.localStorage.setItem("nativeStudentId", s.student_id);

                const classes = classesRes.data?.classes || [];
                setEnrolledClasses(classes.length);

                const records = historyRes.data?.records || [];
                if (records.length > 0) {
                    const presentOrLate = records.filter(
                        (r) => r.status === "present" || r.status === "late",
                    ).length;
                    setAttendanceRate(
                        Math.round((presentOrLate / records.length) * 100),
                    );
                }
            })
            .catch(() => {
                navigate("/", { replace: true });
            })
            .finally(() => setLoading(false));
    }, [navigate]);

    const handleLogout = () => {
        axios
            .post(authApiUrl("logout"), {}, { withCredentials: true })
            .finally(() => {
                window.localStorage.removeItem("nativeStudentId");
                navigate("/", { replace: true });
            });
    };

    const navTo = (path) => {
        setSidebarOpen(false);
        navigate(path);
    };

    const handleScanSuccess = (details) => {
        setShowQRScanner(false);
        setSuccessModal({
            open: true,
            details: {
                ...details,
                studentName:
                    details.studentName ||
                    `${student.first_name} ${student.last_name}`,
                studentId: details.studentId || student.student_id,
            },
        });
    };

    const handleSuccessClose = () =>
        setSuccessModal({ open: false, details: {} });

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-gray-500">Loading...</p>
            </div>
        );
    }

    return (
        <>
            <div className="min-h-screen bg-gray-50">
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black bg-opacity-50 z-40"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                <div
                    className={`fixed top-0 left-0 h-full w-64 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
                        sidebarOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
                >
                    <div className="flex flex-col h-full">
                        <div className="flex items-center justify-between p-4 border-b border-gray-200">
                            <div className="flex items-center gap-3">
                                <img
                                    src={logoUrl}
                                    alt="Logo"
                                    className="h-8 w-8 rounded-full"
                                />
                                <h2 className="text-sm font-bold text-gray-900">
                                    Menu
                                </h2>
                            </div>
                            <button
                                onClick={() => setSidebarOpen(false)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-600" />
                            </button>
                        </div>

                        <nav className="flex-1 p-4 space-y-2">
                            <button
                                onClick={() =>
                                    navTo("/student/attendance-history")
                                }
                                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors text-left"
                            >
                                <Clock className="w-5 h-5 text-gray-600" />
                                <span className="text-sm font-medium text-gray-900">
                                    Attendance History
                                </span>
                            </button>
                            <button
                                onClick={() => navTo("/student/notifications")}
                                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors text-left"
                            >
                                <Bell className="w-5 h-5 text-gray-600" />
                                <span className="text-sm font-medium text-gray-900">
                                    Notifications
                                </span>
                            </button>
                            <button
                                onClick={() => navTo("/student/my-classes")}
                                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors text-left"
                            >
                                <BookOpen className="w-5 h-5 text-gray-600" />
                                <span className="text-sm font-medium text-gray-900">
                                    My Classes
                                </span>
                            </button>
                        </nav>

                        <div className="p-4 border-t border-gray-200">
                            <button
                                onClick={handleLogout}
                                className="w-full px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </div>

                <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
                    <div className="max-w-4xl mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setSidebarOpen(true)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <Menu className="w-6 h-6 text-gray-600" />
                            </button>
                            <img
                                src={logoUrl}
                                alt="Logo"
                                className="h-10 w-10 rounded-full"
                            />
                            <div>
                                <h1 className="text-lg font-bold text-gray-900">
                                    Smart Campus Attendance
                                </h1>
                                <p className="text-xs text-gray-500">
                                    Qr Attend Student Portal
                                </p>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="max-w-4xl mx-auto px-6 py-6 space-y-6">
                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                                <User className="w-6 h-6 text-gray-600" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">
                                    Welcome! {student.first_name}{" "}
                                    {student.last_name}
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
                            onClick={() => navTo("/student/my-classes")}
                            className="bg-white rounded-2xl border border-gray-200 p-6 hover:bg-gray-50 transition-colors text-left"
                        >
                            <p className="text-sm text-gray-600 mb-2">
                                Enrolled Classes
                            </p>
                            <p className="text-4xl font-bold text-gray-900">
                                {enrolledClasses}
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                                Tap to view →
                            </p>
                        </button>
                        <div className="bg-white rounded-2xl border border-gray-200 p-6">
                            <p className="text-sm text-gray-600 mb-2">
                                Attendance Rate
                            </p>
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
    );
}
