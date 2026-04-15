import "../css/app.css"
import "./bootstrap"

import { createRoot } from "react-dom/client"
import { APP_BASE, resolveNativeRoute } from "@/lib/nativeApi"
import { HashRouter, Navigate, Route, Routes } from "react-router-dom"
import Login from "./Pages/Auth/Login"
import TeacherRegister from "./Pages/Auth/TeacherRegister"
import StudentPasswordReset from "./Pages/Auth/StudentPasswordReset"
import TeacherPasswordReset from "./Pages/Auth/TeacherPasswordReset"
import TeacherDashboard from "./Pages/Teacher/Dashboard"
import StudentDashboard from "./Pages/Student/Dashboard"
import TeacherMyClasses from "./Pages/Teacher/MyClasses"
import TeacherNotifications from "./Pages/Teacher/Notifications"
import TeacherReports from "./Pages/Teacher/Reports/Index"
import TeacherAnalytics from "./Pages/Teacher/Analytics/Index"
import StudentMyClasses from "./Pages/Student/MyClasses"
import StudentAttendanceHistory from "./Pages/Student/AttendanceHistory"
import StudentNotifications from "./Pages/Student/Notifications"
import StudentAnalytics from "./Pages/Student/Analytics"
import StudentChatbot from "./Pages/Student/Chatbot"
import RegisterClass from "./Pages/Student/RegisterClass"
import TeacherMessages from "./Pages/Teacher/Messages"
import StudentMessages from "./Pages/Student/Messages"
import GlobalLoadingBar from "@/Components/ui/GlobalLoadingBar"
import { Toaster } from "sileo"

window.APP_BASE = APP_BASE

window.route = (name, ...params) => {
  if (name === undefined) return { current: () => false }
  return resolveNativeRoute(name, ...params)
}

function App() {
  return (
    <>
      <GlobalLoadingBar />
      <Toaster position="top-center" theme="light" />
      <HashRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/teacher/register" element={<TeacherRegister />} />
          <Route
            path="/student/password-reset"
            element={<StudentPasswordReset />}
          />
          <Route
            path="/teacher/password-reset"
            element={<TeacherPasswordReset />}
          />
          <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
          <Route path="/student/dashboard" element={<StudentDashboard />} />
          <Route path="/teacher/classes" element={<TeacherMyClasses />} />
          <Route
            path="/teacher/notifications"
            element={<TeacherNotifications />}
          />
          <Route path="/teacher/reports" element={<TeacherReports />} />
          <Route path="/teacher/analytics" element={<TeacherAnalytics />} />
          <Route path="/student/my-classes" element={<StudentMyClasses />} />
          <Route
            path="/student/attendance-history"
            element={<StudentAttendanceHistory />}
          />
          <Route
            path="/student/notifications"
            element={<StudentNotifications />}
          />
          <Route path="/student/analytics" element={<StudentAnalytics />} />
          <Route path="/student/chatbot" element={<StudentChatbot />} />
          <Route path="/teacher/messages" element={<TeacherMessages />} />
          <Route path="/student/messages" element={<StudentMessages />} />
          <Route
            path="/student/register-class/:classId"
            element={<RegisterClass />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </>
  )
}

createRoot(document.getElementById("app")).render(<App />)
