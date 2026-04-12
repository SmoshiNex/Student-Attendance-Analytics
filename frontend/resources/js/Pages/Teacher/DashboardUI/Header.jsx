import axios from "axios";
import { Button } from "@/Components/ui/button";
import { authApiUrl } from "@/lib/nativeApi";
import logoUrl from "@/lib/logo";
import { Link, useNavigate } from "react-router-dom";

const navItemClass = (isActive) =>
    `text-sm transition-colors ${
        isActive
            ? "text-gray-900 font-semibold"
            : "text-gray-500 hover:text-gray-700"
    }`;

const navLinks = [
    { key: "dashboard", label: "Dashboard", to: "/teacher/dashboard" },
    { key: "classes", label: "My Classes", to: "/teacher/classes" },
    { key: "reports", label: "Reports", to: "/teacher/reports" },
    {
        key: "notifications",
        label: "Notifications",
        to: "/teacher/notifications",
    },
];

export default function Header({ active = "dashboard" }) {
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await axios.post(
                authApiUrl("logout"),
                {},
                { withCredentials: true },
            );
        } finally {
            navigate("/", { replace: true });
        }
    };

    return (
        <header className="bg-white shadow-sm">
            <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <img src={logoUrl} alt="Logo" className="h-10 w-10" />
                    <div>
                        <h2 className="font-semibold text-xl">
                            Smart Campus Attendance
                        </h2>
                        <p className="text-sm text-gray-500">
                            Qr Attend Teacher Portal
                        </p>
                    </div>
                </div>
                <nav className="flex items-center gap-6">
                    {navLinks.map(({ key, label, to }) => (
                        <Link
                            key={key}
                            to={to}
                            className={navItemClass(active === key)}
                        >
                            {label}
                        </Link>
                    ))}
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleLogout}
                    >
                        Logout
                    </Button>
                </nav>
            </div>
        </header>
    );
}
