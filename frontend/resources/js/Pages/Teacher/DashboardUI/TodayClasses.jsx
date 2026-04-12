import ClassCard from './ClassCard';

export default function TodayClasses({ classes, onStartAttendance }) {
    return (
        <div className="bg-white rounded-lg p-6">
            <h2 className="text-xl font-bold mb-6">Today's Classes</h2>
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
    );
}