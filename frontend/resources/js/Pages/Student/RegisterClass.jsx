import { useState, useEffect } from "react"
import { Input } from "@/Components/ui/input"
import { Label } from "@/Components/ui/label"
import { Button } from "@/Components/ui/button"
import { Check, User, BookOpen, Lock } from "lucide-react"
import axios from "axios"
import { teacherClassApiUrl, authApiUrl } from "@/lib/nativeApi"
import PasswordInput from "@/Components/ui/PasswordInput"
import PasswordStrengthChecklist from "@/Components/ui/PasswordStrengthChecklist"
import { Link, useNavigate, useParams } from "react-router-dom"
import { getPasswordPolicyError } from "@/utils/passwordPolicy"
import logoUrl from "@/lib/logo"

export default function RegisterClass() {
  const navigate = useNavigate()
  const { classId = "" } = useParams()

  const [classItem, setClassItem] = useState(null)
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [step, setStep] = useState(1)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState("")

  const [form, setForm] = useState({
    student_id: "",
    first_name: "",
    last_name: "",
    email: "",
    course: "",
    year_level: "",
    section: "",
    parent_email: "",
    password: "",
    password_confirmation: "",
  })

  useEffect(() => {
    if (!classId) {
      setLoadError("Invalid class registration link.")
      setLoading(false)
      return
    }

    Promise.all([
      axios.get(teacherClassApiUrl({ action: "get_class", id: classId }), { withCredentials: true }).catch(() => ({ data: null })),
      axios.get(authApiUrl("current_student"), { withCredentials: true }).catch(() => ({ data: null })),
    ])
      .then(([classRes, studentRes]) => {
        const cls = classRes?.data?.class || null
        if (!cls) {
          setLoadError("Class not found or no longer available.")
        } else {
          setClassItem(cls)
          setStudent(studentRes?.data?.student || null)
        }
      })
      .finally(() => setLoading(false))
  }, [classId])

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }))
    if (submitError) setSubmitError("")
  }

  // Step 1 validation
  const validateStep1 = () => {
    const e = {}
    if (!form.first_name.trim()) e.first_name = "First name is required."
    if (!form.last_name.trim()) e.last_name = "Last name is required."
    if (!form.student_id.trim()) e.student_id = "Student ID is required."
    if (!form.email.trim()) e.email = "Email is required."
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // Step 2 validation
  const validateStep2 = () => {
    const e = {}
    if (!form.course.trim()) e.course = "Course is required."
    if (!form.year_level.trim()) e.year_level = "Year level is required."
    if (!form.section.trim()) e.section = "Section is required."
    if (!form.parent_email.trim()) e.parent_email = "Parent email is required."
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return
    if (step === 2 && !validateStep2()) return
    setStep((s) => s + 1)
  }

  const handleBack = () => {
    setErrors({})
    setStep((s) => s - 1)
  }

  const handleQuickRegister = async () => {
    setProcessing(true)
    setSubmitError("")
    try {
      await axios.post(teacherClassApiUrl({ action: "register_student", class_id: classId }), {}, { withCredentials: true })
      setSuccess(true)
    } catch (err) {
      setSubmitError(err?.response?.data?.message || "Failed to enroll. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError("")

    const passwordPolicyError = getPasswordPolicyError(form.password)
    if (passwordPolicyError) {
      setErrors({ password: passwordPolicyError })
      return
    }
    if (form.password !== form.password_confirmation) {
      setErrors({ password_confirmation: "Passwords do not match." })
      return
    }

    setProcessing(true)
    try {
      await axios.post(teacherClassApiUrl({ action: "register_student", class_id: classId }), form, { withCredentials: true })
      setSuccess(true)
    } catch (err) {
      const data = err?.response?.data
      if (data?.errors) setErrors(data.errors)
      else setSubmitError(data?.message || "Failed to enroll. Please try again.")
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-500">Loading...</p></div>
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white rounded-3xl border border-gray-200 shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Class Not Found</h2>
          <p className="text-sm text-gray-500 mb-6">{loadError}</p>
          <Link to="/" className="block w-full py-2.5 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors">
            Back to Login
          </Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white rounded-3xl border border-gray-200 shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-gray-800" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Enrolled Successfully!</h2>
          <p className="text-gray-500 mb-6">You are now enrolled in <strong>{classItem?.class_code}</strong>.</p>
          <Link to="/student/dashboard" className="block w-full py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors">
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // Class info banner — shown on all steps
  const ClassBanner = () => (
    <div className="bg-gray-900 text-white rounded-xl p-4 mb-6">
      <p className="text-xs uppercase text-gray-400 mb-1">Enrolling in</p>
      <h2 className="text-base font-bold">{classItem.class_code} — {classItem.subject_name}</h2>
      <p className="text-sm text-gray-300">Instructor: {classItem.teacher?.first_name} {classItem.teacher?.last_name}</p>
      {classItem.schedule && <p className="text-xs text-gray-400 mt-1">{classItem.schedule}</p>}
    </div>
  )

  // Already logged in — quick enroll
  if (student) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-gray-200 shadow-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <img src={logoUrl} alt="Logo" className="w-14 h-14 rounded-full object-cover mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-gray-900">Class Registration</h1>
          </div>
          <ClassBanner />
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5">
            <p className="font-semibold text-gray-900">Welcome back, {student.first_name}!</p>
            <p className="text-sm text-gray-500 mt-1">You are already logged in. Click below to enroll.</p>
          </div>
          {submitError && <p className="text-xs text-red-600 font-medium mb-3">{submitError}</p>}
          <Button className="w-full h-12 bg-black hover:bg-gray-800 text-white rounded-xl font-semibold" onClick={handleQuickRegister} disabled={processing}>
            {processing ? "Enrolling..." : "Enroll In Class"}
          </Button>
          <div className="text-center mt-4">
            <Link to="/" className="text-sm text-gray-500 hover:text-gray-900">← Back to Login</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-6">
          <img src={logoUrl} alt="Logo" className="w-14 h-14 rounded-full object-cover mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold text-gray-900">Class Registration</h1>
          <p className="text-gray-500 mt-1 text-sm">Create your account and enroll</p>
        </div>

        <div className="bg-white rounded-3xl border border-gray-200 shadow-lg p-6 sm:p-8">

          {/* Step indicator */}
          <div className="flex items-center justify-center mb-6">
            {[1, 2, 3].map((item, index) => {
              const done = step > item
              const active = step === item
              return (
                <div key={item} className="flex items-center">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors shrink-0 ${done || active ? "bg-black text-white" : "bg-gray-200 text-gray-500"}`}>
                    {done ? <Check className="h-4 w-4" /> : item}
                  </div>
                  {index < 2 && (
                    <div className={`h-1 w-16 sm:w-20 mx-2 rounded ${step > item ? "bg-black" : "bg-gray-200"}`} />
                  )}
                </div>
              )
            })}
          </div>

          <ClassBanner />

          {/* Step 1 — Personal Info */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <div className="h-14 w-14 rounded-2xl bg-gray-100 text-gray-700 flex items-center justify-center mx-auto mb-3">
                  <User className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Personal Information</h2>
                <p className="text-sm text-gray-500 mt-1">Your name, student ID and email</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input id="first_name" placeholder="Juan" value={form.first_name} onChange={(e) => setField("first_name", e.target.value)} className="h-11 rounded-xl" />
                  {errors.first_name && <p className="text-xs text-red-600">{errors.first_name}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input id="last_name" placeholder="Dela Cruz" value={form.last_name} onChange={(e) => setField("last_name", e.target.value)} className="h-11 rounded-xl" />
                  {errors.last_name && <p className="text-xs text-red-600">{errors.last_name}</p>}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="student_id">Student ID</Label>
                <Input id="student_id" placeholder="2021-12345" value={form.student_id} onChange={(e) => setField("student_id", e.target.value)} className="h-11 rounded-xl" />
                <p className="text-xs text-gray-400">This will be your username for logging in</p>
                {errors.student_id && <p className="text-xs text-red-600">{errors.student_id}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="email">Student Email</Label>
                <Input id="email" type="email" placeholder="student@wmsu.edu.ph" value={form.email} onChange={(e) => setField("email", e.target.value)} className="h-11 rounded-xl" />
                {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
              </div>

              <Button onClick={handleNext} className="w-full h-12 rounded-xl bg-black hover:bg-gray-800 text-white font-semibold">
                Next →
              </Button>

              <div className="text-center">
                <Link to="/" className="text-sm text-gray-500 hover:text-gray-900">← Back to Login</Link>
              </div>
            </div>
          )}

          {/* Step 2 — Academic Info */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <div className="h-14 w-14 rounded-2xl bg-gray-100 text-gray-700 flex items-center justify-center mx-auto mb-3">
                  <BookOpen className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Academic Information</h2>
                <p className="text-sm text-gray-500 mt-1">Your course, year, section and parent email</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="course">Course</Label>
                <Input id="course" placeholder="BSIT" value={form.course} onChange={(e) => setField("course", e.target.value)} className="h-11 rounded-xl" />
                {errors.course && <p className="text-xs text-red-600">{errors.course}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="year_level">Year Level</Label>
                  <Input id="year_level" placeholder="3" value={form.year_level} onChange={(e) => setField("year_level", e.target.value)} className="h-11 rounded-xl" />
                  {errors.year_level && <p className="text-xs text-red-600">{errors.year_level}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="section">Section</Label>
                  <Input id="section" placeholder="A" value={form.section} onChange={(e) => setField("section", e.target.value)} className="h-11 rounded-xl" />
                  {errors.section && <p className="text-xs text-red-600">{errors.section}</p>}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="parent_email">Parent / Guardian Email</Label>
                <Input id="parent_email" type="email" placeholder="parent@example.com" value={form.parent_email} onChange={(e) => setField("parent_email", e.target.value)} className="h-11 rounded-xl" />
                <p className="text-xs text-gray-400">Attendance notifications will be sent here</p>
                {errors.parent_email && <p className="text-xs text-red-600">{errors.parent_email}</p>}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handleBack} className="flex-1 h-12 rounded-xl">
                  ← Back
                </Button>
                <Button onClick={handleNext} className="flex-1 h-12 rounded-xl bg-black hover:bg-gray-800 text-white font-semibold">
                  Next →
                </Button>
              </div>
            </div>
          )}

          {/* Step 3 — Password */}
          {step === 3 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-center mb-2">
                <div className="h-14 w-14 rounded-2xl bg-gray-100 text-gray-700 flex items-center justify-center mx-auto mb-3">
                  <Lock className="h-7 w-7" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Create Password</h2>
                <p className="text-sm text-gray-500 mt-1">Set a secure password for your account</p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <PasswordInput id="password" value={form.password} onChange={(e) => setField("password", e.target.value)} placeholder="Minimum 8 characters" className="h-11 rounded-xl" required />
                <PasswordStrengthChecklist password={form.password} />
                {errors.password && <p className="text-xs text-red-600">{errors.password}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="password_confirmation">Confirm Password</Label>
                <PasswordInput
                  id="password_confirmation"
                  value={form.password_confirmation}
                  onChange={(e) => setField("password_confirmation", e.target.value)}
                  placeholder="Repeat your password"
                  className={`h-11 rounded-xl ${form.password_confirmation ? form.password === form.password_confirmation ? "border-green-500 focus-visible:ring-green-500" : "border-red-500 focus-visible:ring-red-500" : ""}`}
                  required
                />
                {form.password_confirmation && (
                  <p className={`text-xs font-medium ${form.password === form.password_confirmation ? "text-green-600" : "text-red-600"}`}>
                    {form.password === form.password_confirmation ? "Passwords match." : "Passwords do not match."}
                  </p>
                )}
                {errors.password_confirmation && <p className="text-xs text-red-600">{errors.password_confirmation}</p>}
              </div>

              {submitError && <p className="text-xs text-red-600 font-medium">{submitError}</p>}

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={handleBack} className="flex-1 h-12 rounded-xl">
                  ← Back
                </Button>
                <Button type="submit" disabled={processing} className="flex-1 h-12 rounded-xl bg-black hover:bg-gray-800 text-white font-semibold">
                  {processing ? "Enrolling..." : "Enroll In Class"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
