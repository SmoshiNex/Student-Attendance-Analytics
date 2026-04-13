export default function WelcomeSection({ teacherFirstName, teacherLastName }) {
  const toTitleCase = (value = "") =>
    String(value)
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const teacherName = [teacherFirstName, teacherLastName]
    .filter(Boolean)
    .map((part) => toTitleCase(part))
    .join(" ")

  return (
    <div className="bg-white rounded-lg p-4 sm:p-6 mb-6">
      <h1 className="text-xl sm:text-2xl font-bold leading-tight">
        Welcome back, Professor {teacherName || "Teacher"}!
      </h1>
      <p className="text-gray-600">{currentDate}</p>
    </div>
  )
}
