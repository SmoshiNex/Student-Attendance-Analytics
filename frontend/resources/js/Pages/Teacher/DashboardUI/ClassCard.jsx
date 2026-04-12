import { Button } from "@/Components/ui/button";
import { Card } from "@/Components/ui/card";

export default function ClassCard({ classItem, onStartAttendance }) {
    return (
        <Card className="p-6 h-full flex flex-col gap-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold">{classItem.code}</h3>
                        {classItem.status && (
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                classItem.status === 'active' 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-gray-100 text-gray-700'
                            }`}>
                                {classItem.status === 'active' ? 'Active' : 'Ended'}
                            </span>
                        )}
                    </div>
                    <p className="text-gray-600">{classItem.name}</p>
                    <div className="flex items-center mt-2 text-sm text-gray-500">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {classItem.time}
                    </div>
                </div>
                <Button 
                    variant="outline" 
                    className="hover:bg-black hover:text-white w-full md:w-auto"
                    onClick={() => onStartAttendance(classItem)}
                >
                    {classItem.status === 'active' ? 'View Session' : 'Start Attendance'}
                </Button>
            </div>
            <div className="flex flex-wrap gap-6">
                <div>
                    <p className="text-sm text-gray-600">Total</p>
                    <p className="font-bold">{classItem.total}</p>
                </div>
                <div>
                    <p className="text-sm text-gray-600">Present</p>
                    <p className="font-bold">{classItem.present}</p>
                </div>
                <div>
                    <p className="text-sm text-gray-600">Absent</p>
                    <p className="font-bold">{classItem.absent}</p>
                </div>
            </div>
        </Card>
    );
}