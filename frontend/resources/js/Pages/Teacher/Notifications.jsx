import { Bell, CheckCircle, XCircle, Clock, Mail } from "lucide-react";
import { useState, useEffect } from "react";
import Header from "./DashboardUI/Header";
import axios from "axios";
import { notificationApiUrl } from "@/lib/nativeApi";
import { useNavigate } from "react-router-dom";

export default function TeacherNotifications() {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [markingAsRead, setMarkingAsRead] = useState(false);

    const fetchNotifications = () => {
        axios
            .get(notificationApiUrl("list"), { withCredentials: true })
            .then((res) => setNotifications(res.data?.notifications || []))
            .catch(() => {
                navigate("/", { replace: true });
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchNotifications();
    }, [navigate]);

    const getTypeIcon = (type) => {
        switch (type) {
            case "attendance":
                return <CheckCircle className="w-5 h-5 text-green-500" />;
            case "email_sent":
                return <Mail className="w-5 h-5 text-blue-500" />;
            case "email_failed":
                return <XCircle className="w-5 h-5 text-red-500" />;
            default:
                return <Bell className="w-5 h-5 text-gray-500" />;
        }
    };

    const getStatusBadge = (status) => {
        const base = "px-2 py-1 rounded-full text-xs font-semibold";
        if (status === "success") return `${base} bg-green-100 text-green-700`;
        if (status === "failed") return `${base} bg-red-100 text-red-700`;
        return `${base} bg-yellow-100 text-yellow-700`;
    };

    const handleMarkAsRead = async (id) => {
        await axios.post(
            notificationApiUrl("mark_read", { id }),
            {},
            { withCredentials: true },
        );
        fetchNotifications();
    };

    const handleMarkAllAsRead = async () => {
        setMarkingAsRead(true);
        try {
            await axios.post(
                notificationApiUrl("mark_all_read"),
                {},
                { withCredentials: true },
            );
            fetchNotifications();
        } finally {
            setMarkingAsRead(false);
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
            <div className="min-h-screen bg-gray-100">
                <Header active="notifications" />
                <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h1 className="text-2xl font-bold text-gray-900">
                                Notifications
                            </h1>
                            {notifications.length > 0 && (
                                <button
                                    onClick={handleMarkAllAsRead}
                                    disabled={markingAsRead}
                                    className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                                >
                                    Mark all as read
                                </button>
                            )}
                        </div>

                        {notifications.length > 0 ? (
                            <div className="space-y-4">
                                {notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        className={`border rounded-lg p-4 transition-colors ${
                                            notification.read_at
                                                ? "bg-gray-50 border-gray-200"
                                                : "bg-white border-gray-300 shadow-sm"
                                        }`}
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className="mt-1">
                                                {getTypeIcon(notification.type)}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <h3
                                                            className={`font-semibold ${notification.read_at ? "text-gray-600" : "text-gray-900"}`}
                                                        >
                                                            {notification.title}
                                                        </h3>
                                                        <p
                                                            className={`text-sm mt-1 ${notification.read_at ? "text-gray-500" : "text-gray-700"}`}
                                                        >
                                                            {
                                                                notification.message
                                                            }
                                                        </p>
                                                        {notification.metadata && (
                                                            <div className="mt-2 text-xs text-gray-500">
                                                                {notification
                                                                    .metadata
                                                                    .class_name && (
                                                                    <span>
                                                                        Class:{" "}
                                                                        {
                                                                            notification
                                                                                .metadata
                                                                                .class_name
                                                                        }
                                                                    </span>
                                                                )}
                                                                {notification
                                                                    .metadata
                                                                    .student_name && (
                                                                    <span className="ml-4">
                                                                        Student:{" "}
                                                                        {
                                                                            notification
                                                                                .metadata
                                                                                .student_name
                                                                        }
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className={getStatusBadge(
                                                                notification.status,
                                                            )}
                                                        >
                                                            {
                                                                notification.status
                                                            }
                                                        </span>
                                                        {!notification.read_at && (
                                                            <button
                                                                onClick={() =>
                                                                    handleMarkAsRead(
                                                                        notification.id,
                                                                    )
                                                                }
                                                                className="text-xs text-blue-600 hover:text-blue-800"
                                                            >
                                                                Mark read
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        <span>
                                                            {new Date(
                                                                notification.created_at,
                                                            ).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    {notification.read_at && (
                                                        <span className="text-green-600">
                                                            Read
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    No Notifications
                                </h3>
                                <p className="text-sm text-gray-500">
                                    You don't have any notifications yet.
                                </p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </>
    );
}
