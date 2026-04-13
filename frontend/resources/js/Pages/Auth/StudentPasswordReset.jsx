import { useState } from "react"
import { Button } from "@/Components/ui/button"
import { Input } from "@/Components/ui/input"
import { Label } from "@/Components/ui/label"
import { ArrowRight } from "lucide-react"
import axios from "axios"
import { authApiUrl } from "@/lib/nativeApi"
import PasswordInput from "@/Components/ui/PasswordInput"
import PasswordStrengthChecklist from "@/Components/ui/PasswordStrengthChecklist"
import { SuccessModal, ErrorModal } from "@/Components/ui/AppModals"
import { Link, useNavigate } from "react-router-dom"
import { getPasswordPolicyError } from "@/utils/passwordPolicy"

export default function StudentPasswordReset() {
  const navigate = useNavigate()
  const [data, setData] = useState({
    student_id: "",
    parent_email: "",
    password: "",
    password_confirmation: "",
  })
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState({})
  const [successModal, setSuccessModal] = useState({
    open: false,
    message: "",
  })
  const [errorModal, setErrorModal] = useState({ open: false, message: "" })

  const updateField = (field, value) =>
    setData((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setProcessing(true)
    setErrors({})

    const passwordPolicyError = getPasswordPolicyError(data.password)
    if (passwordPolicyError) {
      setErrors({ password: passwordPolicyError })
      setProcessing(false)
      return
    }

    if (data.password !== data.password_confirmation) {
      setErrors({
        password_confirmation: "Passwords do not match.",
      })
      setProcessing(false)
      return
    }

    try {
      const response = await axios.post(
        authApiUrl("student_reset_password"),
        data,
      )
      setSuccessModal({
        open: true,
        message: response?.data?.message || "Password reset successfully.",
      })
      setData((prev) => ({
        ...prev,
        password: "",
        password_confirmation: "",
      }))
    } catch (error) {
      setErrorModal({
        open: true,
        message: error?.response?.data?.message || "Failed to reset password.",
      })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      <div className="w-full max-w-md relative">
        <div className="absolute top-6 right-6 z-10">
          <Link
            to="/teacher/password-reset"
            className="group flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200 text-sm font-medium text-gray-600 hover:text-black hover:shadow-md hover:border-gray-300 transition-all duration-200"
          >
            <span>Teacher Reset</span>
            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="flex justify-center mb-6">
            <Link to="/">
              <img
                src="/images/logo.jpg"
                alt="Logo"
                className="w-16 h-16 rounded-full object-cover"
              />
            </Link>
          </div>
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold">Reset Student Password</h2>
            <p className="text-gray-600">
              Reset your password using your parent email
            </p>
          </div>
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-md mb-6">
            <p className="text-sm text-blue-700">
              For security, you need to verify your Student ID and provide your
              registered parent email address.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="student_id">Student ID *</Label>
              <Input
                id="student_id"
                type="text"
                value={data.student_id}
                onChange={(e) => updateField("student_id", e.target.value)}
                placeholder="Enter your student ID"
                required
              />
              {errors.student_id && (
                <p className="text-sm text-red-500">{errors.student_id}</p>
              )}
              <p className="text-xs text-gray-500">
                Your unique student identification number
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="parent_email">Parent Email Address *</Label>
              <Input
                id="parent_email"
                type="email"
                value={data.parent_email}
                onChange={(e) => updateField("parent_email", e.target.value)}
                placeholder="parent@example.com"
                required
              />
              {errors.parent_email && (
                <p className="text-sm text-red-500">{errors.parent_email}</p>
              )}
              <p className="text-xs text-gray-500">
                Must match the email registered with your account
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="password">New Password *</Label>
              <PasswordInput
                id="password"
                value={data.password}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder="Enter new password"
                required
                minLength={8}
              />
              {errors.password && (
                <p className="text-sm text-red-500">{errors.password}</p>
              )}
              <PasswordStrengthChecklist password={data.password} />
              <p className="text-xs text-gray-500">Minimum 8 characters</p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="password_confirmation">
                Confirm New Password *
              </Label>
              <PasswordInput
                id="password_confirmation"
                value={data.password_confirmation}
                onChange={(e) =>
                  updateField("password_confirmation", e.target.value)
                }
                placeholder="Re-enter new password"
                required
                minLength={8}
              />
              {errors.password_confirmation && (
                <p className="text-sm text-red-500">
                  {errors.password_confirmation}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-black hover:bg-gray-800"
              disabled={processing}
            >
              RESET PASSWORD
            </Button>

            <div className="text-center mt-4">
              <Link
                to="/"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                ← Back to Login
              </Link>
            </div>
          </form>
        </div>
      </div>

      <SuccessModal
        open={successModal.open}
        title="Password Reset!"
        message={successModal.message}
        onClose={() => {
          setSuccessModal({ open: false, message: "" })
          navigate("/")
        }}
      />
      <ErrorModal
        open={errorModal.open}
        title="Reset Failed"
        message={errorModal.message}
        onClose={() => setErrorModal({ open: false, message: "" })}
      />
    </div>
  )
}
