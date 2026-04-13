import axios from "axios"
import { Button } from "@/Components/ui/button"
import { authApiUrl } from "@/lib/nativeApi"
import logoUrl from "@/lib/logo"
import {
  BarChart3,
  Bell,
  LayoutDashboard,
  LogOut,
  Menu,
  TrendingUp,
  Users,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

const desktopNavItemClass = (isActive, isCollapsed = false) =>
  `w-full rounded-lg transition-colors text-sm font-medium flex items-center py-2.5 ${
    isCollapsed ? "justify-center px-2" : "text-left px-3 gap-3"
  } ${isActive ? "bg-black text-white" : "text-gray-700 hover:bg-gray-100"}`

const mobileNavItemClass = (isActive) =>
  `w-full text-left px-3 py-3 rounded-lg transition-colors text-sm font-medium flex items-center gap-3 ${
    isActive ? "bg-black text-white" : "text-gray-800 hover:bg-gray-100"
  }`

const navLinks = [
  {
    key: "dashboard",
    label: "Dashboard",
    to: "/teacher/dashboard",
    icon: LayoutDashboard,
    group: "main",
  },
  {
    key: "classes",
    label: "My Classes",
    to: "/teacher/classes",
    icon: Users,
    group: "management",
  },
  {
    key: "reports",
    label: "Attendance Reports",
    to: "/teacher/reports",
    icon: BarChart3,
    group: "management",
  },
  {
    key: "analytics",
    label: "Analytics",
    to: "/teacher/analytics",
    icon: TrendingUp,
    group: "management",
  },
  {
    key: "notifications",
    label: "Notifications",
    to: "/teacher/notifications",
    icon: Bell,
    group: "communication",
  },
]

const mobileSections = [
  { title: null, group: "main" },
  { title: "Management", group: "management" },
  { title: "Communication", group: "communication" },
]

const toTitleCase = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

const getPersonName = (firstName, lastName, fallback) => {
  const fullName = [firstName, lastName]
    .filter(Boolean)
    .map((part) => toTitleCase(part))
    .join(" ")

  return fullName || fallback
}

const getPersonInitials = (firstName, lastName, fallback = "T") => {
  const parts = [firstName, lastName]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean)

  if (parts.length === 0) return fallback

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

export default function Header({ active = "dashboard" }) {
  const navigate = useNavigate()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [teacherProfile, setTeacherProfile] = useState(null)
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem("teacherSidebarCollapsed") === "1"
  })

  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [active])

  useEffect(() => {
    if (!isMobileMenuOpen) return

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false)
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [isMobileMenuOpen])

  useEffect(() => {
    if (typeof window === "undefined") return

    window.localStorage.setItem(
      "teacherSidebarCollapsed",
      isDesktopCollapsed ? "1" : "0",
    )

    document.documentElement.classList.toggle(
      "teacher-sidebar-collapsed",
      isDesktopCollapsed,
    )

    return () => {
      document.documentElement.classList.remove("teacher-sidebar-collapsed")
    }
  }, [isDesktopCollapsed])

  useEffect(() => {
    let mounted = true

    axios
      .get(authApiUrl("current_teacher"), { withCredentials: true })
      .then((res) => {
        if (!mounted) return
        setTeacherProfile(res.data?.teacher ?? null)
      })
      .catch(() => {
        if (!mounted) return
        setTeacherProfile(null)
      })

    return () => {
      mounted = false
    }
  }, [])

  const handleLogout = async () => {
    try {
      await axios.post(authApiUrl("logout"), {}, { withCredentials: true })
    } finally {
      navigate("/", { replace: true })
    }
  }

  const handleMobileNavigate = (to) => {
    setIsMobileMenuOpen(false)
    navigate(to)
  }

  const teacherName = getPersonName(
    teacherProfile?.first_name,
    teacherProfile?.last_name,
    "Teacher Account",
  )
  const teacherInitials = getPersonInitials(
    teacherProfile?.first_name,
    teacherProfile?.last_name,
    "T",
  )

  return (
    <>
      <header className="md:hidden bg-white shadow-sm sticky top-0 z-30">
        <div className="py-3 px-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 shrink-0"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 min-w-0">
              <img
                src={logoUrl}
                alt="Logo"
                className="h-9 w-9 sm:h-10 sm:w-10 rounded-full object-cover object-center shrink-0"
              />
              <div className="min-w-0">
                <h2 className="font-semibold text-sm sm:text-base leading-tight whitespace-normal">
                  Smart Campus Attendance
                </h2>
                <p className="text-[11px] sm:text-xs text-gray-500 leading-tight whitespace-normal">
                  Qr Attend Teacher Portal
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <aside
        className={`hidden md:flex fixed inset-y-0 left-0 z-40 bg-[#f6f6f7] border-r border-gray-200 flex-col transition-[width] duration-300 ${
          isDesktopCollapsed ? "w-20" : "w-64"
        }`}
      >
        <div className="px-3 py-3 border-b bg-white">
          <div
            className={`flex items-center ${
              isDesktopCollapsed ? "justify-center" : "gap-3"
            }`}
          >
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100"
              onClick={() => setIsDesktopCollapsed((prev) => !prev)}
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>

            {!isDesktopCollapsed && (
              <>
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-10 w-10 rounded-full object-cover object-center shrink-0"
                />
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm leading-tight whitespace-normal">
                    Smart Campus Attendance
                  </h2>
                  <p className="text-[11px] text-gray-500 leading-tight whitespace-normal">
                    Qr Attend Teacher Portal
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        <nav
          className={`flex-1 overflow-y-auto py-4 ${
            isDesktopCollapsed ? "px-2" : "px-3"
          }`}
        >
          <div className="flex flex-col gap-5">
            {mobileSections.map(({ title, group }) => {
              const sectionLinks = navLinks.filter(
                (link) => link.group === group,
              )

              if (sectionLinks.length === 0) {
                return null
              }

              return (
                <div key={`desktop-${group}`}>
                  {title && !isDesktopCollapsed && (
                    <p className="px-3 pb-2 text-xs font-semibold tracking-widest text-gray-400 uppercase">
                      {title}
                    </p>
                  )}

                  <div className="flex flex-col gap-1">
                    {sectionLinks.map(({ key, label, to, icon: Icon }) => (
                      <button
                        key={key}
                        onClick={() => navigate(to)}
                        className={desktopNavItemClass(
                          active === key,
                          isDesktopCollapsed,
                        )}
                        title={isDesktopCollapsed ? label : undefined}
                      >
                        <Icon className="h-4 w-4" />
                        {!isDesktopCollapsed && label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </nav>

        <div className="px-3 py-4 border-t bg-white">
          <div
            className={`flex items-center gap-3 ${
              isDesktopCollapsed ? "justify-center mb-2" : "mb-3 px-1"
            }`}
          >
            <div className="h-10 w-10 rounded-full bg-gray-900 text-white font-semibold text-sm flex items-center justify-center">
              {teacherInitials}
            </div>
            {!isDesktopCollapsed && (
              <div className="min-w-0">
                <p
                  className="text-sm font-semibold text-gray-900 truncate"
                  title={teacherName}
                >
                  {teacherName}
                </p>
                <p className="text-xs text-gray-500">Teacher</p>
              </div>
            )}
          </div>

          <Button
            variant="default"
            size="sm"
            onClick={handleLogout}
            className={`bg-black hover:bg-gray-800 text-white ${
              isDesktopCollapsed ? "w-10 h-10 p-0 mx-auto" : "w-full"
            }`}
            title={isDesktopCollapsed ? "Logout" : undefined}
          >
            <LogOut className={`h-4 w-4 ${isDesktopCollapsed ? "" : "mr-2"}`} />
            {!isDesktopCollapsed && "Logout"}
          </Button>
        </div>
      </aside>

      <div
        className={`md:hidden fixed inset-0 z-50 ${
          isMobileMenuOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div
          className={`absolute inset-0 bg-black/45 transition-opacity duration-300 ${
            isMobileMenuOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setIsMobileMenuOpen(false)}
        />

        <aside
          className={`absolute left-0 top-0 h-full w-[88%] max-w-[280px] bg-[#f6f6f7] border-r border-gray-200 shadow-2xl transition-transform duration-300 ease-out flex flex-col ${
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="px-3 py-3 border-b bg-[#f6f6f7] flex items-center">
            <button
              type="button"
              className="p-2 rounded-md text-gray-600 hover:bg-gray-100"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex-1 flex justify-center pr-9">
              <img
                src={logoUrl}
                alt="Logo"
                className="h-10 w-10 rounded-full object-cover object-center shrink-0"
              />
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <div className="flex flex-col gap-5">
              {mobileSections.map(({ title, group }) => {
                const sectionLinks = navLinks.filter(
                  (link) => link.group === group,
                )

                if (sectionLinks.length === 0) {
                  return null
                }

                return (
                  <div key={group}>
                    {title && (
                      <p className="px-3 pb-2 text-xs font-semibold tracking-widest text-gray-400 uppercase">
                        {title}
                      </p>
                    )}

                    <div className="flex flex-col gap-1">
                      {sectionLinks.map(({ key, label, to, icon: Icon }) => (
                        <button
                          key={key}
                          onClick={() => handleMobileNavigate(to)}
                          className={mobileNavItemClass(active === key)}
                        >
                          <Icon className="h-4 w-4" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </nav>

          <div className="px-3 py-4 border-t bg-white">
            <div className="mb-3 px-1 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-black text-white font-semibold text-sm flex items-center justify-center">
                {teacherInitials}
              </div>
              <div className="min-w-0">
                <p
                  className="text-sm font-semibold text-gray-900 truncate"
                  title={teacherName}
                >
                  {teacherName}
                </p>
                <p className="text-xs text-gray-500">Teacher</p>
              </div>
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={handleLogout}
              className="w-full bg-black hover:bg-gray-800 text-white"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </aside>
      </div>
    </>
  )
}
