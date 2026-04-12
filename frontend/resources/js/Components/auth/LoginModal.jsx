import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import axios from "axios";
import PasswordInput from "@/Components/ui/PasswordInput";
import { ErrorModal } from "@/Components/ui/AppModals";
import logoUrl from "@/lib/logo";
import { authApiUrl } from "@/lib/nativeApi";
import { Link, useNavigate } from "react-router-dom";

export default function LoginModal() {
    const navigate = useNavigate();
    const [identifierError, setIdentifierError] = useState("");
    const [loginData, setLoginData] = useState({
        identifier: "",
        password: "",
    });
    const [loginProcessing, setLoginProcessing] = useState(false);
    const [loginErrors, setLoginErrors] = useState({});
    const [errorModal, setErrorModal] = useState({ open: false, message: "" });

    const validateIdentifier = (identifier) => {
        const value = (identifier || "").trim();
        if (!value) {
            setIdentifierError("Email or Student ID is required.");
            return false;
        }
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        if (isEmail && !/@wmsu\.edu\.ph$/i.test(value)) {
            setIdentifierError(
                "Only official @wmsu.edu.ph emails are allowed for teachers.",
            );
            return false;
        }
        setIdentifierError("");
        return true;
    };

    const updateLoginData = (key, value) =>
        setLoginData((prev) => ({ ...prev, [key]: value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateIdentifier(loginData.identifier)) return;
        setLoginProcessing(true);
        setLoginErrors({});
        try {
            const response = await axios.post(
                authApiUrl("unified_login"),
                loginData,
                { withCredentials: true },
            );
            const payload = response?.data || {};
            if (payload?.student?.student_id) {
                window.__nativeStudentId = payload.student.student_id;
                window.localStorage.setItem(
                    "nativeStudentId",
                    payload.student.student_id,
                );
                navigate("/student/dashboard");
            } else if (payload?.teacher) {
                navigate("/teacher/dashboard");
            } else {
                window.location.reload();
            }
        } catch (error) {
            const message =
                error?.response?.data?.message ||
                "Unable to log in. Please check your credentials.";
            setErrorModal({ open: true, message });
        } finally {
            setLoginProcessing(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50/50 p-4">
            <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-gray-100 p-6 sm:p-8 space-y-6">
                <div className="space-y-2 text-center">
                    <div className="inline-block p-3 rounded-full bg-gray-50 mb-2">
                        <img
                            src={logoUrl}
                            alt="Smart Campus Attendance"
                            className="w-12 h-12 rounded-full object-cover"
                        />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                        Welcome Back
                    </h1>
                    <p className="text-sm text-gray-500">
                        Enter your credentials to access your account
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <Input
                            type="text"
                            placeholder="Student ID or Teacher Email (@wmsu.edu.ph)"
                            value={loginData.identifier}
                            onChange={(e) => {
                                const v = e.target.value;
                                updateLoginData("identifier", v);
                                if (v.includes("@")) validateIdentifier(v);
                                else setIdentifierError("");
                                if (loginErrors.message) setLoginErrors({});
                            }}
                            onBlur={(e) => validateIdentifier(e.target.value)}
                            className="h-11 border-gray-200 focus:border-black focus:ring-black rounded-lg"
                            required
                        />
                        {(identifierError || loginErrors.identifier) && (
                            <p className="text-xs text-red-600 font-medium ml-1">
                                {identifierError || loginErrors.identifier}
                            </p>
                        )}
                    </div>

                    <div className="space-y-1">
                        <PasswordInput
                            value={loginData.password}
                            onChange={(e) => {
                                updateLoginData("password", e.target.value);
                                if (loginErrors.message) setLoginErrors({});
                            }}
                            placeholder="Password"
                            className="h-11 border-gray-200 focus:border-black focus:ring-black rounded-lg"
                            required
                        />
                        {loginErrors.password && (
                            <p className="text-xs text-red-600 font-medium ml-1">
                                {loginErrors.password}
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end pt-1">
                        <Link
                            to="/student/password-reset"
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                        >
                            Forgot Password?
                        </Link>
                    </div>

                    <Button
                        type="submit"
                        className="w-full h-11 bg-black hover:bg-gray-800 text-white rounded-lg font-medium transition-all shadow-sm disabled:opacity-70 mt-2"
                        disabled={loginProcessing}
                    >
                        {loginProcessing ? "Logging in..." : "Sign In"}
                    </Button>

                    <div className="pt-4 text-center border-t border-gray-100 mt-6">
                        <Link
                            to="/teacher/register"
                            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-black font-medium transition-colors"
                        >
                            <UserPlus className="w-4 h-4" />
                            <span>Create Instructor Account</span>
                        </Link>
                    </div>
                </form>
            </div>

            <ErrorModal
                open={errorModal.open}
                title="Login Failed"
                message={errorModal.message}
                onClose={() => setErrorModal({ open: false, message: "" })}
            />
        </div>
    );
}
