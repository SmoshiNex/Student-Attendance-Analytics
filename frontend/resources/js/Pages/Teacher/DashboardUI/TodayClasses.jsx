import ClassCard from "./ClassCard"

export default function TodayClasses({ classes, onStartAttendance }) {
  return (
    <div className="bg-white rounded-lg p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6">My Classes</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {classes.map((classItem, index) => (
          <ClassCard
            key={index}
            classItem={classItem}
            onStartAttendance={onStartAttendance}
          />
        ))}
      </div>
    </div>
  )
}
