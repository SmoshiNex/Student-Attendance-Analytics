import { Card, CardContent } from "@/Components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/ui/table";
import StatusBadge from "@/Components/reports/StatusBadge";

export default function ReportsTable({ records = [], isLoading = false }) {
    const safeRecords = Array.isArray(records) ? records : [];

    return (
        <Card>
            <CardContent>
                {isLoading ? (
                    <div className="text-center py-12 text-gray-500">
                        <p>Loading reports…</p>
                    </div>
                ) : safeRecords.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        <p>No attendance records found</p>
                        <p className="text-sm">
                            Try adjusting your filters or check back after students scan QR codes
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-primary text-primary-foreground">
                                <TableRow>
                                    <TableHead className="text-primary-foreground">Student Name</TableHead>
                                    <TableHead className="text-primary-foreground">Student ID</TableHead>
                                    <TableHead className="text-primary-foreground">Class</TableHead>
                                    <TableHead className="text-primary-foreground">Date</TableHead>
                                    <TableHead className="text-primary-foreground">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {safeRecords.map((record) => {
                                    // Support both static demo data structure and database structure
                                    const studentName = record.studentName || 
                                        (record.student ? `${record.student.first_name || ""} ${record.student.last_name || ""}`.trim() : "") || 
                                        "Unknown Student";
                                    const studentId = record.studentId || record.student?.student_id || "—";
                                    // Format class name: class_name OR (class_code - subject_name) OR subject_name OR class_code
                                    let className = record.class;
                                    if (!className && record.session?.teacherClass) {
                                        const tc = record.session.teacherClass;
                                        if (tc.class_name) {
                                            className = tc.class_name;
                                        } else if (tc.class_code && tc.subject_name) {
                                            // Format: "IT 312 - Introduction to Data Analytics"
                                            className = `${tc.class_code} - ${tc.subject_name}`;
                                        } else {
                                            className = tc.subject_name || tc.class_code || "Unknown Class";
                                        }
                                    }
                                    if (!className) {
                                        className = "Unknown Class";
                                    }
                                    
                                    // Format date - use date field (which handles absent records) or fallback to checked_in_at
                                    let formattedDate = "-";
                                    if (record.date) {
                                        const dateObj = new Date(record.date);
                                        if (!isNaN(dateObj.getTime())) {
                                            formattedDate = dateObj.toLocaleDateString("en-US", {
                                                year: "numeric",
                                                month: "short",
                                                day: "numeric",
                                            });
                                        }
                                    } else if (record.checked_in_at) {
                                        formattedDate = new Date(record.checked_in_at).toLocaleDateString("en-US", {
                                            year: "numeric",
                                            month: "short",
                                            day: "numeric",
                                        });
                                    } else if (record.session?.started_at) {
                                        // Fallback to session date for absent records
                                        formattedDate = new Date(record.session.started_at).toLocaleDateString("en-US", {
                                            year: "numeric",
                                            month: "short",
                                            day: "numeric",
                                        });
                                    }

                                    return (
                                        <TableRow key={record.id}>
                                            <TableCell className="font-medium">
                                                {studentName}
                                            </TableCell>
                                            <TableCell>{studentId}</TableCell>
                                            <TableCell>{className}</TableCell>
                                            <TableCell>{formattedDate}</TableCell>
                                            <TableCell>
                                                <StatusBadge status={record.status} />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
