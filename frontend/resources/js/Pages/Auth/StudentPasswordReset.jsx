import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/Components/ui/button"
import { Input } from "@/Components/ui/input"
import { Label } from "@/Components/ui/label"
import { ArrowRight, Check, KeyRound, Lock, Mail } from "lucide-react"
import axios from "axios"
import { authApiUrl } from "@/lib/nativeApi"
import PasswordInput from "@/Components/ui/PasswordInput"
import PasswordStrengthChecklist from "@/Components/ui/PasswordStrengthChecklist"
import { SuccessModal, ErrorModal } from "@/Components/ui/AppModals"
import { Link, useNavigate } from "react-router-dom"
import { getPasswordPolicyError } from "@/utils/passwordPolicy"
import logoUrl from "@/lib/logo"

export default function StudentPasswordReset() {
  const navigate = useNavigate()
  const otpRefs = useRef([])
  const [step, setStep] = useState(1)
  const [data, setData] = useState({
    student_id: "",
    parent_email: "",
    password: "",
    password_confirmation: "",
  })
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""])
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState({})
  const [destination, setDestination] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [resendIn, setResendIn] = useState(0)
  const [successModal, setSuccessModal] = useState({
    open: false,
    message: "",
  })
  const [errorModal, setErrorModal] = useState({ open: false, message: "" })

  const otpCode = useMemo(() => otpDigits.join(""), [otpDigits])
  const passwordsMatch =
    data.password !== "" && data.password === data.password_confirmation

  // Auto-verify when all 6 digits are filled
  useEffect(() => {
    if (otpCode.length === 6 && step === 2 && !processing) {
      handleVerifyOtp({ preventDefault: () => {} })
    }
  }, [otpCode])

  useEffect(() => {
    if (resendIn <= 0) {
      return
    }

    const timer = window.setInterval(() => {
      setResendIn((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [resendIn])

  const updateField = (field, value) =>
    setData((prev) => ({ ...prev, [field]: value }))

  const resetOtpInput = () => {
    setOtpDigits(["", "", "", "", "", ""])
    window.setTimeout(() => {
      otpRefs.current[0]?.focus()
    }, 30)
  }

  const openStepTwo = (responseData) => {
    setDestination(responseData?.destination || data.parent_email)
    setStatusMessage(
      responseData?.message ||
        "We have sent a 6-digit OTP to your parent email address.",
    )
    setResendIn(Number(responseData?.resend_in || 60))
    setErrors({})
    setStep(2)
    resetOtpInput()
  }

  const handleSendOtp = async (e) => {
    e.preventDefault()
    const studentId = data.student_id.trim()
    const parentEmail = data.parent_email.trim()

    if (!studentId || !parentEmail) {
      setErrors({
        step1: "Student ID and parent email are required.",
      })
      return
    }

    setProcessing(true)
    setErrors({})
    try {
      const response = await axios.post(authApiUrl("student_reset_send_otp"), {
        student_id: studentId,
        parent_email: parentEmail,
      })
      openStepTwo(response?.data || {})
    } catch (error) {
      setErrors({
        step1: error?.response?.data?.message || "Failed to send OTP code.",
      })
    } finally {
      setProcessing(false)
    }
  }

  const updateOtpDigit = (index, rawValue) => {
    const digit = String(rawValue || "")
      .replace(/\D/g, "")
      .slice(-1)

    setOtpDigits((prev) => {
      const next = [...prev]
      next[index] = digit
      return next
    })

    if (digit && index < otpRefs.current.length - 1) {
      otpRefs.current[index + 1]?.focus()
    }

    if (errors.otp) {
      setErrors((prev) => ({ ...prev, otp: "" }))
    }
  }

  const handleOtpKeyDown = (index, event) => {
    if (event.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }

    if (event.key === "ArrowLeft" && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }

    if (event.key === "ArrowRight" && index < otpRefs.current.length - 1) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpPaste = (event) => {
    const raw = event.clipboardData.getData("text").replace(/\D/g, "")
    if (!raw) {
      return
    }

    event.preventDefault()
    const digits = raw.slice(0, 6).split("")
    const next = ["", "", "", "", "", ""]
    digits.forEach((digit, index) => {
      next[index] = digit
    })
    setOtpDigits(next)

    const focusIndex = Math.min(digits.length, 5)
    otpRefs.current[focusIndex]?.focus()
  }

  const handleVerifyOtp = async (e) => {
    e.preventDefault()

    if (otpCode.length !== 6) {
      setErrors({ otp: "Enter the full 6-digit OTP code." })
      return
    }

    setProcessing(true)
    setErrors({})
    try {
      const response = await axios.post(
        authApiUrl("student_reset_verify_otp"),
        {
          student_id: data.student_id.trim(),
          parent_email: data.parent_email.trim(),
          otp: otpCode,
        },
      )
      setStatusMessage(
        response?.data?.message ||
          "OTP verified. You can now set a new password.",
      )
      setStep(3)
    } catch (error) {
      setErrors({
        otp: error?.response?.data?.message || "Invalid OTP code.",
      })
    } finally {
      setProcessing(false)
    }
  }

  const handleResendOtp = async () => {
    if (processing || resendIn > 0) {
      return
    }

    setProcessing(true)
    setErrors({})
    try {
      const response = await axios.post(authApiUrl("student_reset_send_otp"), {
        student_id: data.student_id.trim(),
        parent_email: data.parent_email.trim(),
      })
      setStatusMessage(
        response?.data?.message ||
          "A new OTP code has been sent to your parent email.",
      )
      setDestination(response?.data?.destination || data.parent_email)
      setResendIn(Number(response?.data?.resend_in || 60))
      resetOtpInput()
    } catch (error) {
      setErrors({
        otp: error?.response?.data?.message || "Failed to resend OTP code.",
      })
    } finally {
      setProcessing(false)
    }
  }

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
      const response = await axios.post(authApiUrl("student_reset_password"), {
        student_id: data.student_id.trim(),
        parent_email: data.parent_email.trim(),
        password: data.password,
        password_confirmation: data.password_confirmation,
      })
      setSuccessModal({
        open: true,
        message: response?.data?.message || "Password reset successfully.",
      })
      setData({
        student_id: "",
        parent_email: "",
        password: "",
        password_confirmation: "",
      })
      setOtpDigits(["", "", "", "", "", ""])
      setStep(1)
    } catch (error) {
      setErrorModal({
        open: true,
        message: error?.response?.data?.message || "Failed to reset password.",
      })
    } finally {
      setProcessing(false)
    }
  }

  const goToStepOne = () => {
    setStep(1)
    setErrors({})
    setStatusMessage("")
    setResendIn(0)
    setOtpDigits(["", "", "", "", "", ""])
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        <div className="text-center mb-6">
          <img
            src={logoUrl}
            alt="Smart Campus Attendance"
            className="w-16 h-16 rounded-full object-cover mx-auto mb-3"
          />
          <h1 className="text-3xl font-extrabold text-gray-900">
            Smart Campus Attendance
          </h1>
          <p className="text-gray-500 mt-1">Student Password Reset</p>
        </div>

        <div className="bg-white rounded-3xl border border-gray-200 shadow-lg p-6 sm:p-8">
          <div className="flex items-center justify-center mb-7">
            {[1, 2, 3].map((item, index) => {
              const done = step > item
              const active = step === item
              return (
                <div key={item} className="flex items-center">
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors shrink-0 ${
                      done || active
                        ? "bg-black text-white"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {done ? <Check className="h-4 w-4" /> : item}
                  </div>
                  {index < 2 && (
                    <div
                      className={`h-1 w-16 sm:w-24 mx-2 rounded ${
                        step > item ? "bg-black" : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {step === 1 && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="text-center">
                <div className="h-16 w-16 rounded-2xl bg-gray-100 text-gray-700 flex items-center justify-center mx-auto mb-4">
                  <Mail className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Forgot Password?
                </h2>
                <p className="text-gray-500 mt-2">
                  Verify your account and we will send a 6-digit OTP code.
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="student_id">Student ID</Label>
                <Input
                  id="student_id"
                  type="text"
                  value={data.student_id}
                  onChange={(e) => updateField("student_id", e.target.value)}
                  placeholder="Enter your student ID"
                  className="h-12 rounded-xl"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="parent_email">Parent Email Address</Label>
                <Input
                  id="parent_email"
                  type="email"
                  value={data.parent_email}
                  onChange={(e) => updateField("parent_email", e.target.value)}
                  placeholder="parent@example.com"
                  className="h-12 rounded-xl"
                  required
                />
              </div>

              {errors.step1 && (
                <p className="text-sm text-red-600">{errors.step1}</p>
              )}

              <Button
                type="submit"
                disabled={processing}
                className="w-full h-12 rounded-xl bg-black hover:bg-gray-800 text-white font-semibold"
              >
                {processing ? "Sending..." : "Send OTP Code"}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <Link to="/" className="text-gray-600 hover:text-gray-900">
                  Back to Login
                </Link>
                <Link
                  to="/teacher/password-reset"
                  className="text-gray-600 hover:text-gray-900"
                >
                  <span className="inline-flex items-center gap-1">
                    Teacher Reset <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="text-center">
                <div className="h-16 w-16 rounded-2xl bg-black text-white flex items-center justify-center mx-auto mb-4">
                  <KeyRound className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Verify OTP Code
                </h2>
                <p className="text-gray-600 mt-2">
                  We sent a 6-digit code to
                  <span className="font-semibold text-gray-900">
                    {` ${destination || data.parent_email}`}
                  </span>
                </p>
              </div>

              {statusMessage && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-700 text-sm">
                  {statusMessage}
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3 text-center">
                  Enter 6-Digit OTP
                </p>
                <div className="flex items-center justify-center gap-2 sm:gap-3">
                  {otpDigits.map((digit, index) => (
                    <Input
                      key={`otp-${index}`}
                      ref={(element) => {
                        otpRefs.current[index] = element
                      }}
                      value={digit}
                      onChange={(e) => updateOtpDigit(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={handleOtpPaste}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={1}
                      className="h-14 w-11 sm:w-12 text-center text-2xl font-bold rounded-xl"
                    />
                  ))}
                </div>
                {errors.otp && (
                  <p className="text-sm text-red-600 text-center mt-2">
                    {errors.otp}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={processing || otpCode.length !== 6}
                className="w-full h-12 rounded-xl bg-black hover:bg-gray-800 text-white font-semibold"
              >
                {processing ? "Verifying..." : "Verify & Continue"}
              </Button>

              <p className="text-sm text-center text-gray-600">
                Did not receive the code?{" "}
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={processing || resendIn > 0}
                  className="font-semibold text-gray-800 disabled:text-gray-400"
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </p>

              <button
                type="button"
                onClick={goToStepOne}
                className="w-full text-sm text-gray-600 hover:text-gray-900"
              >
                Change Account Details
              </button>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-center mb-1">
                <div className="h-16 w-16 rounded-2xl bg-gray-100 text-gray-700 flex items-center justify-center mx-auto mb-4">
                  <Lock className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Reset Password
                </h2>
                <p className="text-gray-600 mt-2">
                  Enter your new password below.
                </p>
              </div>

              {statusMessage && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-700 text-sm">
                  {statusMessage}
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="student-id-readonly">Student ID</Label>
                <Input
                  id="student-id-readonly"
                  type="text"
                  value={data.student_id}
                  readOnly
                  className="h-12 rounded-xl bg-gray-50"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="parent-email-readonly">
                  Parent Email Address
                </Label>
                <Input
                  id="parent-email-readonly"
                  type="email"
                  value={data.parent_email}
                  readOnly
                  className="h-12 rounded-xl bg-gray-50"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="password">New Password</Label>
                <PasswordInput
                  id="password"
                  value={data.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  placeholder="Enter new password"
                  className="h-12 rounded-xl"
                  required
                  minLength={8}
                />
                {errors.password && (
                  <p className="text-sm text-red-600">{errors.password}</p>
                )}
                <PasswordStrengthChecklist password={data.password} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="password_confirmation">
                  Confirm New Password
                </Label>
                <PasswordInput
                  id="password_confirmation"
                  value={data.password_confirmation}
                  onChange={(e) =>
                    updateField("password_confirmation", e.target.value)
                  }
                  placeholder="Re-enter new password"
                  className={`h-12 rounded-xl ${
                    data.password_confirmation
                      ? passwordsMatch
                        ? "border-green-500 focus-visible:ring-green-500"
                        : "border-red-500 focus-visible:ring-red-500"
                      : ""
                  }`}
                  required
                  minLength={8}
                />
                {data.password_confirmation && (
                  <p
                    className={`text-sm ${
                      passwordsMatch ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {passwordsMatch
                      ? "Passwords match."
                      : "Passwords do not match."}
                  </p>
                )}
                {errors.password_confirmation && (
                  <p className="text-sm text-red-600">
                    {errors.password_confirmation}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-12 rounded-xl bg-black hover:bg-gray-800 text-white font-semibold"
                disabled={processing}
              >
                {processing ? "Resetting..." : "Reset Password"}
              </Button>

              <div className="text-center mt-2">
                <Link
                  to="/"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Back to Login
                </Link>
              </div>
            </form>
          )}
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
