import { Badge } from "@/Components/ui/badge";

export default function StatusBadge({ status }) {
    const baseClass = "border-none text-xs font-semibold px-3 py-1";
    const normalized = (status || "").toLowerCase();

    switch (normalized) {
        case "present":
            return (
                <Badge
                    className={baseClass}
                    style={{ backgroundColor: "#B9F8CF", color: "#111827" }}
                >
                    Present
                </Badge>
            );
        case "late":
            return (
                <Badge
                    className={baseClass}
                    style={{ backgroundColor: "#FFF085", color: "#111827" }}
                >
                    Late
                </Badge>
            );
        case "absent":
            return (
                <Badge
                    className={baseClass}
                    style={{ backgroundColor: "#FFC9C9", color: "#111827" }}
                >
                    Absent
                </Badge>
            );
        default:
            return (
                <Badge className={baseClass}>
                    {status || "—"}
                </Badge>
            );
    }
}


