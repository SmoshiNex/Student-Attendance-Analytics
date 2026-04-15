import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { UserPlus } from "lucide-react"
import axios from "axios"
import PasswordInput from "@/Components/ui/PasswordInput"
import logoUrl from "@/lib/logo"
import { authApiUrl } from "@/lib/nativeApi"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "@/lib/toast"

export default function LoginModal() {
  const navigate = useNavigate()
  const [emailError, setEmailError] = useState("")
  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  })
  const [loginProcessing, setLoginProcessing] = useState(false)
  const [loginErrors, setLoginErrors] = useState({})

  useEffect(() => {
    const flag = sessionStorage.getItem("logout_toast")
    if (flag) {
      sessionStorage.removeItem("logout_toast")
      toast.success("Logged out", "You have been logged out successfully.")
    }
  }, [])

  const validateEmail = (email) => {
    const value = (email || "").trim()
    if (!value) {
      setEmailError("Registered email is required.")
      return false
    }

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    if (!isEmail) {
      setEmailError("Please enter a valid email address.")
      return false
    }

    setEmailError("")
    return true
  }

  const updateLoginData = (key, value) =>
    setLoginData((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateEmail(loginData.email)) return

    const loginPayload = {
      email: loginData.email.trim(),
      password: loginData.password,
    }

    setLoginProcessing(true)
    setLoginErrors({})
    try {
      const response = await axios.post(
        authApiUrl("unified_login"),
        loginPayload,
        {
          withCredentials: true,
        },
      )
      const responsePayload = response?.data || {}
      if (responsePayload?.student?.student_id) {
        window.__nativeStudentId = responsePayload.student.student_id
        window.localStorage.setItem("nativeStudentId", responsePayload.student.student_id)
        sessionStorage.setItem("login_toast", `Welcome back, ${responsePayload.student.first_name}!`)
        navigate("/student/dashboard")
      } else if (responsePayload?.teacher) {
        sessionStorage.setItem("login_toast", `Welcome back, ${responsePayload.teacher.first_name}!`)
        navigate("/teacher/dashboard")
      } else {
        window.location.reload()
      }
    } catch (error) {
      toast.error("Login Failed", error?.response?.data?.message || "Unable to log in. Please check your credentials.")
    } finally {
      setLoginProcessing(false)
    }
  }

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
              type="email"
              placeholder="Registered email address"
              value={loginData.email}
              onChange={(e) => {
                const v = e.target.value
                updateLoginData("email", v)
                if (v.trim()) validateEmail(v)
                else setEmailError("")
                if (loginErrors.message) setLoginErrors({})
              }}
              onBlur={(e) => validateEmail(e.target.value)}
              className="h-11 border-gray-200 focus:border-black focus:ring-black rounded-lg"
            />
            {(emailError || loginErrors.email) && (
              <p className="text-xs text-red-600 font-medium ml-1">
                {emailError || loginErrors.email}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <PasswordInput
              value={loginData.password}
              onChange={(e) => {
                updateLoginData("password", e.target.value)
                if (loginErrors.message) setLoginErrors({})
              }}
              placeholder="Password"
              className="h-11 border-gray-200 focus:border-black focus:ring-black rounded-lg"
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
    </div>
  )
}
