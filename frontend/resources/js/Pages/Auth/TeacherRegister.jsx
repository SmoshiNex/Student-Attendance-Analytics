import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/Components/ui/button"
import { Input } from "@/Components/ui/input"
import { Label } from "@/Components/ui/label"
import { ArrowLeft, Check, KeyRound, UserPlus } from "lucide-react"
import axios from "axios"
import { authApiUrl } from "@/lib/nativeApi"
import PasswordInput from "@/Components/ui/PasswordInput"
import PasswordStrengthChecklist from "@/Components/ui/PasswordStrengthChecklist"
import { toast } from "@/lib/toast"
import { Link, useNavigate } from "react-router-dom"
import { getPasswordPolicyError } from "@/utils/passwordPolicy"
import logoUrl from "@/lib/logo"

export default function TeacherRegister() {
  const navigate = useNavigate()
  const otpRefs = useRef([])
  const [step, setStep] = useState(1)
  const [data, setData] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    email: "",
    department: "",
    password: "",
    password_confirmation: "",
  })
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""])
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState("")
  const [destination, setDestination] = useState("")
  const [statusMessage, setStatusMessage] = useState("")
  const [resendIn, setResendIn] = useState(0)

  const otpCode = useMemo(() => otpDigits.join(""), [otpDigits])
  const passwordsMatch =
    data.password !== "" && data.password === data.password_confirmation

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = window.setInterval(() => {
      setResendIn((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [resendIn])

  // Auto-verify when all 6 digits are filled
  useEffect(() => {
    if (otpCode.length === 6 && step === 2 && !processing) {
      handleVerifyOtp({ preventDefault: () => {} })
    }
  }, [otpCode])

  const updateField = (field, value) =>
    setData((prev) => ({ ...prev, [field]: value }))

  const resetOtpInput = () => {
    setOtpDigits(["", "", "", "", "", ""])
    window.setTimeout(() => { otpRefs.current[0]?.focus() }, 30)
  }

  const openStepTwo = (responseData) => {
    setDestination(responseData?.destination || data.email)
    setStatusMessage(responseData?.message || "We have sent a 6-digit OTP to your email.")
    setResendIn(Number(responseData?.resend_in || 60))
    setErrors({})
    setStep(2)
    resetOtpInput()
  }

  const handleSendOtp = async (e) => {
    e.preventDefault()
    const firstName = data.first_name.trim()
    const lastName = data.last_name.trim()
    const email = data.email.trim()
    const department = data.department.trim()

    if (!firstName || !lastName || !email || !department) {
      setErrors({ step1: "First name, last name, department, and email are required." })
      return
    }
    if (!/@wmsu\.edu\.ph$/i.test(email)) {
      setErrors({ email: "Please use your official @wmsu.edu.ph email address." })
      return
    }

    setProcessing(true)
    setErrors({})
    try {
      const response = await axios.post(authApiUrl("teacher_register_send_otp"), {
        first_name: firstName,
        middle_name: data.middle_name.trim(),
        last_name: lastName,
        email,
        department,
      })
      openStepTwo(response?.data || {})
    } catch (error) {
      setErrors({ step1: error?.response?.data?.message || "Failed to send OTP code." })
    } finally {
      setProcessing(false)
    }
  }

  const updateOtpDigit = (index, rawValue) => {
    const digit = String(rawValue || "").replace(/\D/g, "").slice(-1)
    setOtpDigits((prev) => {
      const next = [...prev]
      next[index] = digit
      return next
    })
    if (digit && index < otpRefs.current.length - 1) {
      otpRefs.current[index + 1]?.focus()
    }
    if (errors.otp) setErrors((prev) => ({ ...prev, otp: "" }))
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
    if (!raw) return
    event.preventDefault()
    const digits = raw.slice(0, 6).split("")
    const next = ["", "", "", "", "", ""]
    digits.forEach((digit, index) => { next[index] = digit })
    setOtpDigits(next)
    otpRefs.current[Math.min(digits.length, 5)]?.focus()
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
      const response = await axios.post(authApiUrl("teacher_register_verify_otp"), {
        email: data.email.trim(),
        otp: otpCode,
      })
      setStatusMessage(response?.data?.message || "OTP verified. You can now create your account.")
      setStep(3)
    } catch (error) {
      setErrors({ otp: error?.response?.data?.message || "Invalid OTP code." })
    } finally {
      setProcessing(false)
    }
  }

  const handleResendOtp = async () => {
    if (processing || resendIn > 0) return
    setProcessing(true)
    setErrors({})
    try {
      const response = await axios.post(authApiUrl("teacher_register_send_otp"), {
        first_name: data.first_name.trim(),
        middle_name: data.middle_name.trim(),
        last_name: data.last_name.trim(),
        email: data.email.trim(),
        department: data.department.trim(),
      })
      setStatusMessage(response?.data?.message || "A new OTP code has been sent to your email.")
      setDestination(response?.data?.destination || data.email)
      setResendIn(Number(response?.data?.resend_in || 60))
      resetOtpInput()
    } catch (error) {
      setErrors({ otp: error?.response?.data?.message || "Failed to resend OTP code." })
    } finally {
      setProcessing(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setProcessing(true)
    setErrors({})
    setSubmitError("")

    const passwordPolicyError = getPasswordPolicyError(data.password)
    if (passwordPolicyError) {
      setErrors({ password: passwordPolicyError })
      setProcessing(false)
      return
    }
    if (data.password !== data.password_confirmation) {
      setErrors({ password_confirmation: "Passwords do not match." })
      setProcessing(false)
      return
    }

    try {
      const response = await axios.post(authApiUrl("teacher_register"), {
        first_name: data.first_name.trim(),
        middle_name: data.middle_name.trim(),
        last_name: data.last_name.trim(),
        email: data.email.trim(),
        department: data.department.trim(),
        password: data.password,
        password_confirmation: data.password_confirmation,
      })
      toast.success("Account Created!", response?.data?.message || "Teacher account created successfully.")
      setData({ first_name: "", middle_name: "", last_name: "", email: "", department: "", password: "", password_confirmation: "" })
      setOtpDigits(["", "", "", "", "", ""])
      setStep(1)
      setStatusMessage("")
      setDestination("")
      setResendIn(0)
      navigate("/")
    } catch (error) {
      setSubmitError(error?.response?.data?.message || "Failed to create instructor account.")
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
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="text-center mb-6">
          <img src={logoUrl} alt="Smart Campus Attendance" className="w-16 h-16 rounded-full object-cover mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold text-gray-900">Create Instructor Account</h1>
          <p className="text-gray-500 mt-1 text-sm">WMSU Instructor Registration</p>
        </div>

        <div className="bg-white rounded-3xl border border-gray-200 shadow-lg p-6 sm:p-8">

          {/* Step indicator */}
          <div className="flex items-center justify-center mb-7">
            {[1, 2, 3].map((item, index) => {
              const done = step > item
              const active = step === item
              return (
                <div key={item} className="flex items-center">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors shrink-0 ${done || active ? "bg-black text-white" : "bg-gray-200 text-gray-500"}`}>
                    {done ? <Check className="h-4 w-4" /> : item}
                  </div>
                  {index < 2 && (
                    <div className={`h-1 w-16 sm:w-24 mx-2 rounded ${step > item ? "bg-black" : "bg-gray-200"}`} />
                  )}
                </div>
              )
            })}
          </div>

          {/* Step 1 — Details */}
          {step === 1 && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="text-center">
                <div className="h-16 w-16 rounded-2xl bg-gray-100 text-gray-700 flex items-center justify-center mx-auto mb-4">
                  <UserPlus className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Instructor Details</h2>
                <p className="text-gray-500 mt-2 text-sm">Fill in your details and we will send a 6-digit OTP to your WMSU email.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input id="first_name" value={data.first_name} onChange={(e) => updateField("first_name", e.target.value)} placeholder="Juan" className="h-11 rounded-xl" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="middle_name">Middle Name <span className="text-gray-400 font-normal">(Optional)</span></Label>
                  <Input id="middle_name" value={data.middle_name} onChange={(e) => updateField("middle_name", e.target.value)} placeholder="Santos" className="h-11 rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input id="last_name" value={data.last_name} onChange={(e) => updateField("last_name", e.target.value)} placeholder="Dela Cruz" className="h-11 rounded-xl" required />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="department">Department</Label>
                <Input id="department" value={data.department} onChange={(e) => updateField("department", e.target.value)} placeholder="e.g. CCS" className="h-11 rounded-xl" required />
              </div>

              <div className="space-y-1">
                <Label htmlFor="email">WMSU Email</Label>
                <Input id="email" type="email" value={data.email} onChange={(e) => { updateField("email", e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: "" })) }} placeholder="name@wmsu.edu.ph" className="h-11 rounded-xl" required />
                {errors.email && <p className="text-xs text-red-600 font-medium">{errors.email}</p>}
              </div>

              {errors.step1 && <p className="text-xs text-red-600 font-medium">{errors.step1}</p>}

              <Button type="submit" disabled={processing} className="w-full h-12 rounded-xl bg-black hover:bg-gray-800 text-white font-semibold">
                {processing ? "Sending..." : "Send OTP Code"}
              </Button>

              <div className="text-center">
                <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1">
                  <ArrowLeft className="h-4 w-4" /> Back to Login
                </Link>
              </div>
            </form>
          )}

          {/* Step 2 — OTP */}
          {step === 2 && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="text-center">
                <div className="h-16 w-16 rounded-2xl bg-black text-white flex items-center justify-center mx-auto mb-4">
                  <KeyRound className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Verify OTP</h2>
                <p className="text-gray-500 mt-2 text-sm">
                  We sent a 6-digit code to{" "}
                  <span className="font-semibold text-gray-900">{destination || data.email}</span>
                </p>
              </div>

              {statusMessage && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-700 text-sm">
                  {statusMessage}
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3 text-center">Enter 6-Digit OTP</p>
                <div className="flex items-center justify-center gap-2 sm:gap-3">
                  {otpDigits.map((digit, index) => (
                    <Input
                      key={`otp-${index}`}
                      ref={(el) => { otpRefs.current[index] = el }}
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
                {errors.otp && <p className="text-sm text-red-600 text-center mt-2">{errors.otp}</p>}
              </div>

              <Button type="submit" disabled={processing || otpCode.length !== 6} className="w-full h-12 rounded-xl bg-black hover:bg-gray-800 text-white font-semibold">
                {processing ? "Verifying..." : "Verify & Continue"}
              </Button>

              <p className="text-sm text-center text-gray-600">
                Did not receive the code?{" "}
                <button type="button" onClick={handleResendOtp} disabled={processing || resendIn > 0} className="font-semibold text-gray-800 disabled:text-gray-400">
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </p>

              <button type="button" onClick={goToStepOne} className="w-full text-sm text-gray-600 hover:text-gray-900">
                Change Registration Details
              </button>
            </form>
          )}

          {/* Step 3 — Password */}
          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-center">
                <div className="h-16 w-16 rounded-2xl bg-gray-100 text-gray-700 flex items-center justify-center mx-auto mb-4">
                  <UserPlus className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Set Password</h2>
                <p className="text-gray-500 mt-2 text-sm">Complete your account setup.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="step3-email">WMSU Email</Label>
                  <Input id="step3-email" type="email" value={data.email} readOnly className="h-11 rounded-xl bg-gray-50" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="step3-department">Department</Label>
                  <Input id="step3-department" value={data.department} readOnly className="h-11 rounded-xl bg-gray-50" />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <PasswordInput id="password" value={data.password} onChange={(e) => updateField("password", e.target.value)} placeholder="Minimum 8 characters" className="h-11 rounded-xl" minLength={8} required />
                <PasswordStrengthChecklist password={data.password} />
                {errors.password && <p className="text-xs text-red-600 font-medium">{errors.password}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="password_confirmation">Confirm Password</Label>
                <PasswordInput
                  id="password_confirmation"
                  value={data.password_confirmation}
                  onChange={(e) => updateField("password_confirmation", e.target.value)}
                  placeholder="Re-enter password"
                  className={`h-11 rounded-xl ${data.password_confirmation ? passwordsMatch ? "border-green-500 focus-visible:ring-green-500" : "border-red-500 focus-visible:ring-red-500" : ""}`}
                  minLength={8}
                  required
                />
                {data.password_confirmation && (
                  <p className={`text-xs font-medium ${passwordsMatch ? "text-green-600" : "text-red-600"}`}>
                    {passwordsMatch ? "Passwords match." : "Passwords do not match."}
                  </p>
                )}
                {errors.password_confirmation && <p className="text-xs text-red-600 font-medium">{errors.password_confirmation}</p>}
              </div>

              {submitError && <p className="text-xs text-red-600 font-medium">{submitError}</p>}

              <Button type="submit" disabled={processing} className="w-full h-12 rounded-xl bg-black hover:bg-gray-800 text-white font-semibold">
                {processing ? "Creating..." : "Create Account"}
              </Button>

              <div className="text-center">
                <Link to="/" className="text-sm text-gray-600 hover:text-gray-900">Back to Login</Link>
              </div>
            </form>
          )}
        </div>
      </div>

    </div>
  )
}
