import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/Components/ui/dialog";
import { Button } from "@/Components/ui/button";
import { CheckCircle2, AlertTriangle } from "lucide-react"; 

export default function CheckInSuccessModal({
    open,
    onClose,
    details = {},
    onBackToDashboard,
}) {
    const {
        className = "—",
        time = "—",
        status = "PRESENT", // This will now receive 'LATE' correctly
        studentName = "",
        studentId = "",
    } = details;

    const handleBackClick = () => {
        if (onBackToDashboard) {
            onBackToDashboard();
        }
        onClose?.();
    };

    const displayTime = time && time !== "—" ? time : new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: true 
    });

    // Determine styling based on status
    const isLate = status === 'LATE';
    const statusColor = isLate ? "text-yellow-600" : "text-emerald-600";
    const iconColor = isLate ? "text-yellow-500" : "text-emerald-500";
    const badgeBg = isLate ? "#FFF085" : "#B9F8CF";
    const badgeText = isLate ? "#854d0e" : "#064e3b";

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="w-[92vw] max-w-sm sm:max-w-md rounded-2xl p-0">
                <DialogHeader className="space-y-4 px-5 pt-6 sm:px-6 text-center">
                    <div className="flex justify-center">
                        {/* Dynamic Icon */}
                        {isLate ? (
                            <AlertTriangle className={`w-16 h-16 ${iconColor}`} />
                        ) : (
                            <CheckCircle2 className={`w-16 h-16 ${iconColor}`} />
                        )}
                    </div>
                    <div className="space-y-2">
                        <DialogTitle className="text-2xl font-bold text-gray-900">
                            {isLate ? "Checked In" : "Success!"}
                        </DialogTitle>
                        
                        {/* Dynamic Text: PRESENT vs LATE */}
                        <p className={`${statusColor} font-semibold text-base`}>
                            You are marked {status}
                        </p>
                        
                        <p className="text-sm text-gray-500">
                            Your attendance has been recorded successfully.
                        </p>
                    </div>
                </DialogHeader>

                <div className="px-5 sm:px-6 pb-5">
                    <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 space-y-3">
                        {(studentName || studentId) && (
                            <div className="flex items-center justify-between py-2 border-b border-gray-200">
                                <span className="text-sm font-medium text-gray-600">Student</span>
                                <div className="text-right">
                                    {studentName && (
                                        <span className="text-sm font-semibold text-gray-900 block">{studentName}</span>
                                    )}
                                    {studentId && (
                                        <span className="text-xs text-gray-500">{studentId}</span>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between py-2 border-b border-gray-200">
                            <span className="text-sm font-medium text-gray-600">Class</span>
                            <span className="text-sm font-semibold text-gray-900 text-right max-w-[60%] break-words">
                                {className}
                            </span>
                        </div>

                        <div className="flex items-center justify-between py-2 border-b border-gray-200">
                            <span className="text-sm font-medium text-gray-600">Time</span>
                            <span className="text-sm font-semibold text-gray-900 text-right">{displayTime}</span>
                        </div>

                        <div className="flex items-center justify-between py-2">
                            <span className="text-sm font-medium text-gray-600">Status</span>
                            <span
                                className="text-xs font-semibold px-3 py-1.5 rounded-full"
                                style={{ 
                                    backgroundColor: badgeBg,
                                    color: badgeText
                                }}
                            >
                                {status}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="px-5 sm:px-6 pb-5">
                    <Button 
                        className="w-full bg-black hover:bg-gray-900 text-white" 
                        onClick={handleBackClick}
                    >
                        Back to Dashboard
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}