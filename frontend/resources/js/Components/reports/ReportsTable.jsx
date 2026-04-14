import { Card, CardContent } from "@/Components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/Components/ui/table"
import StatusBadge from "@/Components/reports/StatusBadge"

export default function ReportsTable({ records = [], isLoading = false }) {
  const safeRecords = Array.isArray(records) ? records : []

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
                  <TableHead className="text-primary-foreground">Check-in Time</TableHead>
                  <TableHead className="text-primary-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeRecords.map((record) => {
                  const studentName =
                    record.studentName ||
                    (record.student
                      ? `${record.student.first_name || ""} ${record.student.last_name || ""}`.trim()
                      : "") ||
                    "Unknown Student"

                  const studentId = record.studentId || record.student?.student_id || "—"

                  let className = record.class
                  if (!className && record.session?.teacherClass) {
                    const tc = record.session.teacherClass
                    if (tc.class_name) {
                      className = tc.class_name
                    } else if (tc.class_code && tc.subject_name) {
                      className = `${tc.class_code} - ${tc.subject_name}`
                    } else {
                      className = tc.subject_name || tc.class_code || "Unknown Class"
                    }
                  }
                  if (!className) className = "Unknown Class"

                  // Date column — date only
                  let formattedDate = "—"
                  const rawDate = record.date || record.checked_in_at
                  if (rawDate) {
                    const d = new Date(rawDate)
                    if (!isNaN(d.getTime())) {
                      formattedDate = d.toLocaleDateString("en-US", {
                        year: "numeric", month: "short", day: "numeric",
                      })
                    }
                  }

                  // Check-in time column — time only, "—" for absent
                  let checkInTime = "—"
                  if (record.checked_in_time) {
                    checkInTime = record.checked_in_time
                  } else if (record.checked_in_at) {
                    const d = new Date(record.checked_in_at)
                    if (!isNaN(d.getTime())) {
                      checkInTime = d.toLocaleTimeString("en-US", {
                        hour: "2-digit", minute: "2-digit", hour12: true,
                      })
                    }
                  }

                  return (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{studentName}</TableCell>
                      <TableCell>{studentId}</TableCell>
                      <TableCell>{className}</TableCell>
                      <TableCell>{formattedDate}</TableCell>
                      <TableCell className="text-gray-500">{checkInTime}</TableCell>
                      <TableCell>
                        <StatusBadge status={record.status} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
