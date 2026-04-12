import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/Components/ui/dialog";
import { Camera } from "lucide-react";
import { useQrScanner } from "@/hooks/useQrScanner";
import CameraView from "@/Components/qr/CameraView";
import { parseAttendanceResponse } from "@/utils/qrParser";

export default function QRScannerModal({ open, onClose, onSuccess }) {
    const { videoRef, error, isScanning } = useQrScanner(open, (data) => {
        const attendanceDetails = parseAttendanceResponse(data);
        if (attendanceDetails) {
            onSuccess?.(attendanceDetails);
        }
    });

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="w-[92vw] max-w-sm sm:max-w-md rounded-2xl p-0">
                <DialogHeader className="space-y-1 px-5 pt-5 sm:px-6">
                    <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                        <Camera className="w-5 h-5 text-gray-700" />
                        <span>Scan QR Code</span>
                    </DialogTitle>
                    <DialogDescription className="text-xs text-gray-500">
                        Use your device camera to quickly check in to class.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 px-5 pb-5 sm:px-6">
                    {/* Camera feed */}
                    <CameraView videoRef={videoRef} isScanning={isScanning} error={error} />

                    {/* Instruction below camera */}
                    <p className="text-sm text-gray-700 text-center px-2">
                        Point your camera at the teacher&apos;s QR code to check in for class.
                    </p>

                    {/* Status indicators with consistent theme */}
                    <div className="w-full grid grid-cols-3 gap-2 text-[11px] font-semibold mt-1">
                        <div className="flex items-center justify-center rounded-full bg-emerald-100 text-emerald-800 py-1">
                            On Time
                        </div>
                        <div className="flex items-center justify-center rounded-full bg-amber-100 text-amber-800 py-1">
                            Late
                        </div>
                        <div className="flex items-center justify-center rounded-full bg-rose-100 text-rose-800 py-1">
                            Error
                        </div>
                    </div>

                    {/* Hint at the bottom */}
                    <p className="text-xs text-gray-500 text-center">
                        Make sure the QR code is clearly visible and well-lit.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
