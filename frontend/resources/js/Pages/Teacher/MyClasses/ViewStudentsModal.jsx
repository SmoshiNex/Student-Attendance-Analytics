import { Button } from "@/Components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/Components/ui/dialog";

export default function ViewStudentsModal({ isOpen, onClose, classItem, students }) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Enrolled Students</DialogTitle>
                    <p className="text-sm text-gray-600">
                        {classItem?.class_code} - {classItem?.subject_name}
                    </p>
                    <p className="text-sm text-gray-500">
                        Total Students: {students?.length || 0}
                    </p>
                </DialogHeader>

                <div className="mt-4 max-h-96 overflow-y-auto border rounded-lg">
                    {students && students.length > 0 ? (
                        <table className="w-full">
                            <thead className="bg-black text-white sticky top-0">
                                <tr>
                                    <th className="text-left p-3 font-semibold">Student ID</th>
                                    <th className="text-left p-3 font-semibold">Student Name</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map((student, index) => (
                                    <tr 
                                        key={student.id || index}
                                        className="border-b hover:bg-gray-50"
                                    >
                                        <td className="p-3 font-medium">{student.student_id}</td>
                                        <td className="p-3">{student.first_name} {student.last_name}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            No students enrolled yet
                        </div>
                    )}
                </div>

                <div className="flex justify-end mt-4">
                    <Button onClick={onClose}>Close</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}