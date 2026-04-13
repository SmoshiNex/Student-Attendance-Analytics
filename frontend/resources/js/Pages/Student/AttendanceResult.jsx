import { Link, useLocation } from "react-router-dom"
import { CheckCircle, XCircle, ArrowLeft, Clock, Calendar } from "lucide-react"
import { Button } from "@/Components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/Components/ui/card"

export default function AttendanceResult() {
  const location = useLocation()
  const {
    success = true,
    status = "present",
    message = "Attendance has been recorded.",
    class: teacherClass,
    record,
  } = location.state || {}

  const getStatusStyles = () => {
    if (!success) {
      return {
        icon: <XCircle className="h-16 w-16 text-red-500" />,
        title: "Check-in Failed",
        color: "text-red-700",
        bg: "bg-red-50",
      }
    }

    if (status === "late") {
      return {
        icon: <Clock className="h-16 w-16 text-amber-500" />,
        title: "Marked Late",
        color: "text-amber-700",
        bg: "bg-amber-50",
      }
    }

    return {
      icon: <CheckCircle className="h-16 w-16 text-green-500" />,
      title: "Check-in Successful",
      color: "text-green-700",
      bg: "bg-green-50",
    }
  }

  const styles = getStatusStyles()

  return (
    <div className="min-h-screen bg-gray-100 py-12">
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="text-center shadow-lg">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <div className={`rounded-full p-3 ${styles.bg}`}>
                {styles.icon}
              </div>
            </div>
            <CardTitle className={`text-2xl ${styles.color}`}>
              {styles.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-gray-600 text-lg">{message}</p>

            {teacherClass && (
              <div className="bg-gray-50 rounded-lg p-6 text-left border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                  <Calendar className="h-5 w-5 mr-2 text-gray-500" />
                  Session Details
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Class</span>
                    <span className="font-medium text-gray-900">
                      {teacherClass.class_name || teacherClass.subject_name}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500">Code</span>
                    <span className="font-medium text-gray-900">
                      {teacherClass.class_code}
                    </span>
                  </div>
                  {record && (
                    <div className="flex justify-between py-2 border-b border-gray-100">
                      <span className="text-gray-500">Time</span>
                      <span className="font-medium text-gray-900">
                        {record.checked_in_at}
                      </span>
                    </div>
                  )}
                  {status && (
                    <div className="flex justify-between py-2">
                      <span className="text-gray-500">Status</span>
                      <span
                        className={`font-bold uppercase ${
                          status === "present"
                            ? "text-green-600"
                            : status === "late"
                              ? "text-amber-600"
                              : "text-red-600"
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="pt-4">
              <Link to="/student/dashboard">
                <Button className="w-full sm:w-auto">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Return to Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
