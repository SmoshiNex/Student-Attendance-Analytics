import { useState, useEffect } from "react";
import { Button } from "@/Components/ui/button";
import { Card } from "@/Components/ui/card";
import { Input } from "@/Components/ui/input";
import { Label } from "@/Components/ui/label";
import axios from "axios";
import { teacherClassApiUrl, authApiUrl } from "@/lib/nativeApi";
import PasswordInput from "@/Components/ui/PasswordInput";
import { ErrorModal, SuccessModal } from "@/Components/ui/AppModals";
import { Link, useNavigate, useParams } from "react-router-dom";

export default function RegisterClass() {
    const navigate = useNavigate();
    const { classId = "" } = useParams();

    const [classItem, setClassItem] = useState(null);
    const [student, setStudent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [processing, setProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [errorModal, setErrorModal] = useState({ open: false, message: "" });
    const [errors, setErrors] = useState({});

    const [form, setForm] = useState({
        student_id: "",
        first_name: "",
        last_name: "",
        email: "",
        course: "",
        year_level: "",
        section: "",
        parent_email: "",
        password: "",
        password_confirmation: "",
    });

    useEffect(() => {
        if (!classId) {
            setLoadError("Invalid class registration link.");
            setLoading(false);
            return;
        }

        const fetchClass = axios
            .get(teacherClassApiUrl({ action: "get_class", id: classId }), {
                withCredentials: true,
            })
            .catch(() => ({ data: null }));
        const fetchStudent = axios
            .get(authApiUrl("current_student"), { withCredentials: true })
            .catch(() => ({ data: null }));

        Promise.all([fetchClass, fetchStudent])
            .then(([classRes, studentRes]) => {
                const cls = classRes?.data?.class || null;
                if (!cls) {
                    setLoadError("Class not found or no longer available.");
                } else {
                    setClassItem(cls);
                    setStudent(studentRes?.data?.student || null);
                }
            })
            .finally(() => setLoading(false));
    }, [classId]);

    const setField = (key, value) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleQuickRegister = async () => {
        if (!classId) {
            setErrorModal({
                open: true,
                message: "Invalid class registration link.",
            });
            return;
        }

        setProcessing(true);
        try {
            await axios.post(
                teacherClassApiUrl({
                    action: "register_student",
                    class_id: classId,
                }),
                {},
                { withCredentials: true },
            );
            setSuccess(true);
        } catch (err) {
            setErrorModal({
                open: true,
                message:
                    err?.response?.data?.message ||
                    "Failed to enroll. Please try again.",
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();

        if (!classId) {
            setErrorModal({
                open: true,
                message: "Invalid class registration link.",
            });
            return;
        }

        setProcessing(true);
        setErrors({});
        try {
            await axios.post(
                teacherClassApiUrl({
                    action: "register_student",
                    class_id: classId,
                }),
                form,
                { withCredentials: true },
            );
            setSuccess(true);
        } catch (err) {
            const data = err?.response?.data;
            if (data?.errors) setErrors(data.errors);
            else
                setErrorModal({
                    open: true,
                    message:
                        data?.message || "Failed to enroll. Please try again.",
                });
        } finally {
            setProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-gray-500">Loading...</p>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
                <Card className="max-w-md w-full p-8 text-center">
                    <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg
                            className="w-7 h-7 text-red-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </div>
                    <h2 className="text-lg font-bold text-gray-900 mb-2">
                        Class Not Found
                    </h2>
                    <p className="text-sm text-gray-600 mb-6">{loadError}</p>
                    <Link
                        to="/"
                        className="block w-full py-2.5 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
                    >
                        Back to Login
                    </Link>
                </Card>
            </div>
        );
    }

    if (success) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
                <Card className="max-w-md w-full p-8 text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg
                            className="w-8 h-8 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold mb-2">
                        Enrolled Successfully!
                    </h2>
                    <p className="text-gray-600 mb-6">
                        You are now enrolled in {classItem?.class_code}.
                    </p>
                    <Link
                        to="/student/dashboard"
                        className="block w-full py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
                    >
                        Go to Dashboard
                    </Link>
                </Card>
            </div>
        );
    }

    return (
        <>
            <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
                <Card className="max-w-md w-full p-8">
                    <div className="flex items-center mb-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(-1)}
                        >
                            ← Back
                        </Button>
                    </div>

                    <div className="text-center mb-6">
                        <div className="flex justify-center mb-3">
                            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
                                <svg
                                    className="w-8 h-8 text-white"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
                                </svg>
                            </div>
                        </div>
                        <h1 className="text-3xl font-bold mb-2">
                            Class Registration
                        </h1>
                        <p className="text-gray-600">
                            Complete this form to enroll in the class
                        </p>
                    </div>

                    <div className="bg-black text-white rounded-lg p-4 mb-6">
                        <p className="text-xs uppercase text-gray-400 mb-1">
                            You are enrolling in
                        </p>
                        <h2 className="text-lg font-bold mb-1">
                            {classItem.class_code} - {classItem.subject_name}
                        </h2>
                        <p className="text-sm text-gray-300">
                            Instructor: Prof. {classItem.teacher?.last_name}
                        </p>
                        {classItem.schedule && (
                            <p className="text-sm text-gray-300">
                                {classItem.schedule}
                            </p>
                        )}
                    </div>

                    {student ? (
                        <div>
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                                <p className="text-green-800 font-medium">
                                    Welcome back, {student.first_name}!
                                </p>
                                <p className="text-green-600 text-sm">
                                    Click below to register for this class
                                </p>
                            </div>
                            <Button
                                className="w-full"
                                size="lg"
                                onClick={handleQuickRegister}
                                disabled={processing}
                            >
                                {processing
                                    ? "Enrolling..."
                                    : "ENROLL IN CLASS"}
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleRegister} className="space-y-4">
                            <div>
                                <Label htmlFor="first_name">First Name *</Label>
                                <Input
                                    id="first_name"
                                    placeholder="Juan"
                                    value={form.first_name}
                                    onChange={(e) =>
                                        setField("first_name", e.target.value)
                                    }
                                    required
                                />
                                {errors.first_name && (
                                    <p className="text-sm text-red-500 mt-1">
                                        {errors.first_name}
                                    </p>
                                )}
                            </div>
                            <div>
                                <Label htmlFor="last_name">Last Name *</Label>
                                <Input
                                    id="last_name"
                                    placeholder="Dela Cruz"
                                    value={form.last_name}
                                    onChange={(e) =>
                                        setField("last_name", e.target.value)
                                    }
                                    required
                                />
                                {errors.last_name && (
                                    <p className="text-sm text-red-500 mt-1">
                                        {errors.last_name}
                                    </p>
                                )}
                            </div>
                            <div>
                                <Label htmlFor="student_id">Student ID *</Label>
                                <Input
                                    id="student_id"
                                    placeholder="2021-12345"
                                    value={form.student_id}
                                    onChange={(e) =>
                                        setField("student_id", e.target.value)
                                    }
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    This will be your username for logging in
                                </p>
                                {errors.student_id && (
                                    <p className="text-sm text-red-500 mt-1">
                                        {errors.student_id}
                                    </p>
                                )}
                            </div>
                            <div>
                                <Label htmlFor="email">Student Email *</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="student@wmsu.edu.ph"
                                    value={form.email}
                                    onChange={(e) =>
                                        setField("email", e.target.value)
                                    }
                                    required
                                />
                                {errors.email && (
                                    <p className="text-sm text-red-500 mt-1">
                                        {errors.email}
                                    </p>
                                )}
                            </div>
                            <div>
                                <Label htmlFor="course">Course *</Label>
                                <Input
                                    id="course"
                                    placeholder="BSIT"
                                    value={form.course}
                                    onChange={(e) =>
                                        setField("course", e.target.value)
                                    }
                                    required
                                />
                                {errors.course && (
                                    <p className="text-sm text-red-500 mt-1">
                                        {errors.course}
                                    </p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label htmlFor="year_level">
                                        Year Level *
                                    </Label>
                                    <Input
                                        id="year_level"
                                        placeholder="3"
                                        value={form.year_level}
                                        onChange={(e) =>
                                            setField(
                                                "year_level",
                                                e.target.value,
                                            )
                                        }
                                        required
                                    />
                                    {errors.year_level && (
                                        <p className="text-sm text-red-500 mt-1">
                                            {errors.year_level}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <Label htmlFor="section">Section *</Label>
                                    <Input
                                        id="section"
                                        placeholder="A"
                                        value={form.section}
                                        onChange={(e) =>
                                            setField("section", e.target.value)
                                        }
                                        required
                                    />
                                    {errors.section && (
                                        <p className="text-sm text-red-500 mt-1">
                                            {errors.section}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="parent_email">
                                    Parent's/Guardian's Email *
                                </Label>
                                <Input
                                    id="parent_email"
                                    type="email"
                                    placeholder="parent@example.com"
                                    value={form.parent_email}
                                    onChange={(e) =>
                                        setField("parent_email", e.target.value)
                                    }
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Attendance notifications will be sent here
                                </p>
                                {errors.parent_email && (
                                    <p className="text-sm text-red-500 mt-1">
                                        {errors.parent_email}
                                    </p>
                                )}
                            </div>
                            <div>
                                <Label htmlFor="password">
                                    Create Password *
                                </Label>
                                <PasswordInput
                                    id="password"
                                    value={form.password}
                                    onChange={(e) =>
                                        setField("password", e.target.value)
                                    }
                                    placeholder="Minimum 8 characters"
                                    required
                                />
                                {errors.password && (
                                    <p className="text-sm text-red-500 mt-1">
                                        {errors.password}
                                    </p>
                                )}
                            </div>
                            <div>
                                <Label htmlFor="password_confirmation">
                                    Confirm Password *
                                </Label>
                                <PasswordInput
                                    id="password_confirmation"
                                    value={form.password_confirmation}
                                    onChange={(e) =>
                                        setField(
                                            "password_confirmation",
                                            e.target.value,
                                        )
                                    }
                                    placeholder="Repeat your password"
                                    required
                                />
                                {errors.password_confirmation && (
                                    <p className="text-sm text-red-500 mt-1">
                                        {errors.password_confirmation}
                                    </p>
                                )}
                            </div>
                            <Button
                                type="submit"
                                className="w-full"
                                size="lg"
                                disabled={processing}
                            >
                                {processing
                                    ? "Enrolling..."
                                    : "ENROLL IN CLASS"}
                            </Button>
                        </form>
                    )}
                </Card>
            </div>

            <ErrorModal
                open={errorModal.open}
                title="Enrollment Failed"
                message={errorModal.message}
                onClose={() => setErrorModal({ open: false, message: "" })}
            />
        </>
    );
}
