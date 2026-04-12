/**
 * Parse attendance details from API response
 */
export function parseAttendanceResponse(data) {
    const isSuccess = Boolean(data?.success) || data?.status === "success";
    if (!data || !isSuccess) {
        return null;
    }

    // Format class name logic...
    let className = data.class?.class_name;
    if (!className && data.class) {
        if (data.class.class_code && data.class.subject_name) {
            className = `${data.class.class_code} - ${data.class.subject_name}`;
        } else {
            className =
                data.class.subject_name ||
                data.class.class_code ||
                "Unknown Class";
        }
    }
    if (!className) {
        className = "Unknown Class";
    }

    // Time formatting logic...
    let time = data.record?.checked_in_at_formatted;
    if (!time && data.record?.checked_in_at) {
        const timeStr = data.record.checked_in_at;
        if (timeStr.includes(":")) {
            const [hours, minutes, seconds] = timeStr.split(":");
            const hour24 = parseInt(hours, 10);
            const hour12 =
                hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
            const ampm = hour24 >= 12 ? "PM" : "AM";
            time = `${hour12}:${minutes}:${seconds || "00"} ${ampm}`;
        }
    }
    if (!time) {
        time = new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
        });
    }

    // --- THE FIX IS HERE ---
    // Old code was: const status = 'PRESENT';
    // New code reads the status from the database:
    const status = (
        data.record?.status ||
        data.status ||
        "present"
    ).toUpperCase();

    const studentName = data.student?.name || "";
    const studentId = data.student?.student_id || "";

    return {
        className,
        time,
        status,
        studentName,
        studentId,
    };
}
