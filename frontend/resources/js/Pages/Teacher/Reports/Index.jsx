import { useState, useEffect, useRef } from "react";
import { Button } from "@/Components/ui/button";
import { Download } from "lucide-react";
import ReportsFilters from "@/Components/reports/ReportsFilters";
import ReportsTable from "@/Components/reports/ReportsTable";
import Header from "../DashboardUI/Header";
import axios from "axios";
import { attendanceApiUrl } from "@/lib/nativeApi";

const FILTER_STORAGE_KEY = "reports_filters";
const AUTO_REFRESH_INTERVAL = 5000; // 5 seconds
const AUTO_REFRESH_DELAY = 1000; // 1 second initial delay

export default function ReportsIndex({
    records = [],
    classes = [],
    filters = {},
}) {
    const safeRecords = Array.isArray(records) ? records : [];
    const safeClasses = Array.isArray(classes) ? classes : [];

    // State management
    const [localRecords, setLocalRecords] = useState(safeRecords);
    const [localClasses, setLocalClasses] = useState(safeClasses);
    const [localFilters, setLocalFilters] = useState(() =>
        initializeFilters(filters),
    );
    const [isLoading, setIsLoading] = useState(false);

    // Refs for stable references
    const filtersRef = useRef(localFilters);
    const hasInitialized = useRef(false);
    const isInitialMount = useRef(true);

    // Keep ref in sync with localFilters
    useEffect(() => {
        filtersRef.current = localFilters;
    }, [localFilters]);

    // Initialize filters from server on mount
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            hasInitialized.current = true;
            return;
        }

        if (hasInitialized.current) return;

        const serverClassId = filters.class_id
            ? filters.class_id.toString()
            : "all";
        const serverDate = filters.date || "";

        if (
            serverClassId !== localFilters.class_id ||
            serverDate !== localFilters.date
        ) {
            setLocalFilters({
                class_id: serverClassId,
                date: serverDate,
            });
        }

        hasInitialized.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.class_id, filters.date]);

    // Update local classes when prop changes
    useEffect(() => {
        if (safeClasses.length > 0) {
            setLocalClasses(safeClasses);
        }
    }, [safeClasses]);

    useEffect(() => {
        setLocalRecords(safeRecords);
    }, [safeRecords]);

    // Save filters to localStorage
    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(
            FILTER_STORAGE_KEY,
            JSON.stringify(localFilters),
        );
    }, [localFilters]);

    // Auto-refresh reports every 5 seconds
    useEffect(() => {
        // Fetch on initial mount
        requestRecords(localFilters);

        let intervalId = null;
        const timeout = setTimeout(() => {
            intervalId = setInterval(() => {
                refreshReportsSilently();
            }, AUTO_REFRESH_INTERVAL);
        }, AUTO_REFRESH_DELAY);

        return () => {
            clearTimeout(timeout);
            if (intervalId) clearInterval(intervalId);
        };
    }, []); // Only run once on mount

    // Request records from server
    const requestRecords = async (nextFilters, silent = false) => {
        const payload = buildFilterPayload(nextFilters);

        if (!silent) {
            setIsLoading(true);
        }

        try {
            const response = await axios.get(attendanceApiUrl("reports"), {
                params: payload,
                withCredentials: true,
            });

            const apiData = response?.data || {};
            setLocalRecords(
                Array.isArray(apiData.records) ? apiData.records : [],
            );
            if (Array.isArray(apiData.classes)) {
                setLocalClasses(apiData.classes);
            }
        } catch (error) {
            console.error("Error fetching reports:", error);
        } finally {
            if (!silent) {
                setIsLoading(false);
            }
        }
    };

    // Refresh reports silently (for auto-refresh)
    const refreshReportsSilently = () => {
        const currentFilters = filtersRef.current;
        requestRecords(currentFilters, true);
    };

    // Build filter payload from filters object
    const buildFilterPayload = (filters) => {
        const payload = {};

        if (filters.class_id && filters.class_id !== "all") {
            payload.class_id = filters.class_id;
        }

        if (filters.date && filters.date.trim() !== "") {
            payload.date = filters.date;
        }

        return payload;
    };

    // Handle class filter change
    const handleClassChange = (value) => {
        setLocalFilters((prev) => {
            const next = { ...prev, class_id: value };
            requestRecords(next);
            return next;
        });
    };

    // Handle date filter change
    const handleDateChange = (value) => {
        setLocalFilters((prev) => {
            const next = { ...prev, date: value };
            requestRecords(next);
            return next;
        });
    };

    // Clear all filters
    const clearFilters = () => {
        const cleared = {
            class_id: "all",
            date: "",
        };
        setLocalFilters(cleared);

        if (typeof window !== "undefined") {
            window.localStorage.setItem(
                FILTER_STORAGE_KEY,
                JSON.stringify(cleared),
            );
        }

        requestRecords(cleared);
    };

    // Export report to CSV
    const exportReport = () => {
        const headers = [
            "Student Name",
            "Student ID",
            "Class",
            "Date",
            "Status",
        ];
        const rows = (localRecords || []).map((record) => {
            const studentName =
                record.studentName ||
                (record.student
                    ? `${record.student.first_name || ""} ${record.student.last_name || ""}`.trim()
                    : "") ||
                "Unknown Student";
            const studentId =
                record.studentId || record.student?.student_id || "";
            const className =
                record.class ||
                (record.session?.teacherClass
                    ? `${record.session.teacherClass.class_code || ""}${record.session.teacherClass.subject_name ? ` - ${record.session.teacherClass.subject_name}` : ""}`.trim()
                    : "") ||
                "Unknown Class";
            const date = record.date || record.checked_in_at || "";
            const status = (record.status || "").toUpperCase();

            return [studentName, studentId, className, date, status]
                .map((value) => `"${String(value).replaceAll('"', '""')}"`)
                .join(",");
        });

        const csvContent = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csvContent], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", "attendance-reports.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <>
            <div className="min-h-screen bg-gray-100">
                <Header active="reports" />

                <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-3xl font-bold text-gray-900">
                            Attendance Reports
                        </h1>
                        <Button
                            onClick={exportReport}
                            className="flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Export CSV
                        </Button>
                    </div>

                    <ReportsFilters
                        classes={localClasses}
                        filters={localFilters}
                        onClassChange={handleClassChange}
                        onDateChange={handleDateChange}
                        onClear={clearFilters}
                        isLoading={isLoading}
                    />

                    <ReportsTable
                        records={localRecords}
                        isLoading={isLoading}
                    />
                </main>
            </div>
        </>
    );
}

/**
 * Initialize filters from localStorage or server props
 */
function initializeFilters(serverFilters) {
    if (typeof window === "undefined") {
        return {
            class_id: serverFilters.class_id
                ? serverFilters.class_id.toString()
                : "all",
            date: serverFilters.date || "",
        };
    }

    try {
        const stored = window.localStorage.getItem(FILTER_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return {
                class_id: parsed.class_id || "all",
                date: parsed.date || "",
            };
        }
    } catch (error) {
        console.error("Error parsing stored filters", error);
    }

    return {
        class_id: serverFilters.class_id
            ? serverFilters.class_id.toString()
            : "all",
        date: serverFilters.date || "",
    };
}
