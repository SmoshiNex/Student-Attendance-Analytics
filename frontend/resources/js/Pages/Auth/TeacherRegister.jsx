import { useState } from "react"
import { Button } from "@/Components/ui/button"
import { Input } from "@/Components/ui/input"
import { Label } from "@/Components/ui/label"
import axios from "axios"
import { authApiUrl } from "@/lib/nativeApi"
import PasswordInput from "@/Components/ui/PasswordInput"
import PasswordStrengthChecklist from "@/Components/ui/PasswordStrengthChecklist"
import { SuccessModal, ErrorModal } from "@/Components/ui/AppModals"
import { Link, useNavigate } from "react-router-dom"
import { getPasswordPolicyError } from "@/utils/passwordPolicy"

export default function TeacherRegister() {
  const navigate = useNavigate()
  const [data, setData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    department: "",
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

    if (!/@wmsu\.edu\.ph$/i.test(data.email || "")) {
      setErrors({
        email: "Please use your official @wmsu.edu.ph email address.",
      })
      setProcessing(false)
      return
    }

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
      const response = await axios.post(authApiUrl("teacher_register"), data)
      setSuccessModal({
        open: true,
        message:
          response?.data?.message || "Teacher account created successfully.",
      })
      setData((prev) => ({
        ...prev,
        password: "",
        password_confirmation: "",
      }))
    } catch (error) {
      setErrorModal({
        open: true,
        message:
          error?.response?.data?.message ||
          "Failed to create instructor account.",
      })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 px-4 py-6">
      <div className="w-full max-w-md relative">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="flex justify-center mb-6">
            <Link to="/">
              <img
                src="/images/new-logo.png"
                alt="Logo"
                className="w-16 h-16 rounded-full object-cover"
              />
            </Link>
          </div>
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold">Create Instructor Account</h2>
            <p className="text-gray-600 text-sm">
              Use your official WMSU email to register.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="first_name">First Name *</Label>
                <Input
                  id="first_name"
                  value={data.first_name}
                  onChange={(e) => updateField("first_name", e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="last_name">Last Name *</Label>
                <Input
                  id="last_name"
                  value={data.last_name}
                  onChange={(e) => updateField("last_name", e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="department">Department *</Label>
              <Input
                id="department"
                value={data.department}
                onChange={(e) => updateField("department", e.target.value)}
                placeholder="e.g. CCS"
                required
              />
            </div>

            <div>
              <Label htmlFor="email">WMSU Email *</Label>
              <Input
                id="email"
                type="email"
                value={data.email}
                onChange={(e) => updateField("email", e.target.value)}
                placeholder="name@wmsu.edu.ph"
                required
              />
              {errors.email && (
                <p className="text-sm text-red-500 mt-1">{errors.email}</p>
              )}
            </div>

            <div>
              <Label htmlFor="password">Password *</Label>
              <PasswordInput
                id="password"
                value={data.password}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder="Minimum 8 characters"
                minLength={8}
                required
              />
              <PasswordStrengthChecklist password={data.password} />
              {errors.password && (
                <p className="text-sm text-red-500 mt-1">{errors.password}</p>
              )}
            </div>

            <div>
              <Label htmlFor="password_confirmation">Confirm Password *</Label>
              <PasswordInput
                id="password_confirmation"
                value={data.password_confirmation}
                onChange={(e) =>
                  updateField("password_confirmation", e.target.value)
                }
                placeholder="Re-enter password"
                minLength={8}
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
              className="w-full bg-black hover:bg-gray-800"
              disabled={processing}
            >
              {processing ? "Creating..." : "Create Account"}
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
        title="Account Created!"
        message={successModal.message}
        onClose={() => {
          setSuccessModal({ open: false, message: "" })
          navigate("/")
        }}
      />
      <ErrorModal
        open={errorModal.open}
        title="Registration Failed"
        message={errorModal.message}
        onClose={() => setErrorModal({ open: false, message: "" })}
      />
    </div>
  )
}
