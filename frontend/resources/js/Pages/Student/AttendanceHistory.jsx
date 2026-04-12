import {
    ArrowLeft,
    Clock,
    CheckCircle,
    AlertCircle,
    Calendar,
    XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import axios from "axios";
import { authApiUrl, attendanceApiUrl } from "@/lib/nativeApi";
import { Link, useNavigate } from "react-router-dom";

export default function AttendanceHistory() {
    const navigate = useNavigate();
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios
            .get(authApiUrl("current_student"), { withCredentials: true })
            .then((res) => {
                if (!res.data?.student) {
                    navigate("/", { replace: true });
                    return null;
                }
                return axios.get(attendanceApiUrl("student_history"), {
                    withCredentials: true,
                });
            })
            .then((res) => {
                if (res) setRecords(res.data?.records || []);
            })
            .catch(() => {
                navigate("/", { replace: true });
            })
            .finally(() => setLoading(false));
    }, [navigate]);

    const getStatusIcon = (status) => {
        if (status === "present")
            return <CheckCircle className="w-5 h-5 text-green-500" />;
        if (status === "late")
            return <AlertCircle className="w-5 h-5 text-yellow-500" />;
        return <XCircle className="w-5 h-5 text-red-500" />;
    };

    const getStatusBadge = (status) => {
        const base = "px-3 py-1 rounded-full text-xs font-semibold";
        if (status === "present") return `${base} bg-green-100 text-green-700`;
        if (status === "late") return `${base} bg-yellow-100 text-yellow-700`;
        return `${base} bg-red-100 text-red-700`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-gray-500">Loading...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
                <div className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-3">
                    <Link
                        to="/student/dashboard"
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </Link>
                    <div>
                        <h1 className="text-base sm:text-lg font-bold text-gray-900">
                            Attendance History
                        </h1>
                        <p className="text-xs text-gray-500">
                            View your attendance records
                        </p>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
                {records.length > 0 ? (
                    <div className="space-y-3 sm:space-y-4">
                        {records.map((record) => (
                            <div
                                key={record.id}
                                className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 sm:gap-3 mb-2">
                                            <div className="flex-shrink-0">
                                                {getStatusIcon(record.status)}
                                            </div>
                                            <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                                                {record.class_name}
                                            </h3>
                                        </div>
                                        {record.subject_name && (
                                            <p className="text-xs sm:text-sm text-gray-600 mb-2">
                                                {record.subject_name}
                                            </p>
                                        )}
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm text-gray-500">
                                            <div className="flex items-center gap-1">
                                                <Calendar className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                                                <span>
                                                    {record.status === "absent"
                                                        ? "Not checked in"
                                                        : record.checked_in_at_formatted}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                                                <span>
                                                    Teacher:{" "}
                                                    {record.teacher_name}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div
                                        className={`${getStatusBadge(record.status)} flex-shrink-0 self-start`}
                                    >
                                        {record.status.toUpperCase()}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                        <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            No Attendance Records
                        </h3>
                        <p className="text-sm text-gray-500">
                            You haven't checked in to any classes yet.
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
}
