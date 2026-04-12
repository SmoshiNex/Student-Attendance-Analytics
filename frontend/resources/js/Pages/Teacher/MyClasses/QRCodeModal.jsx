import { Button } from "@/Components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/Components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import { buildPublicAppUrl } from "@/lib/nativeApi";

export default function QRCodeModal({ isOpen, onClose, classItem }) {
    if (!classItem) return null;

    const registrationUrl = buildPublicAppUrl(
        `/student/register-class/${classItem.id}`,
    );

    const handleDownload = () => {
        const svg = document.getElementById("qr-code-svg");
        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const img = new Image();

        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const pngFile = canvas.toDataURL("image/png");

            const downloadLink = document.createElement("a");
            downloadLink.download = `${classItem.class_code}_QR.png`;
            downloadLink.href = pngFile;
            downloadLink.click();
        };

        img.src = "data:image/svg+xml;base64," + btoa(svgData);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Class Registration QR Code</DialogTitle>
                    <DialogDescription>
                        Students can scan this QR code to register for{" "}
                        {classItem.class_code}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center gap-4 py-6">
                    <div className="p-4 bg-white rounded-lg border-2 border-gray-200">
                        <QRCodeSVG
                            id="qr-code-svg"
                            value={registrationUrl}
                            size={256}
                            level="H"
                            includeMargin={true}
                        />
                    </div>

                    <div className="text-center">
                        <p className="font-semibold text-lg">
                            {classItem.class_code}
                        </p>
                        <p className="text-gray-600">
                            {classItem.subject_name}
                        </p>
                        {classItem.room && (
                            <p className="text-sm text-gray-500">
                                Room: {classItem.room}
                            </p>
                        )}
                    </div>

                    <div className="flex gap-3 w-full">
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={handleDownload}
                        >
                            Download QR Code
                        </Button>
                        <Button
                            variant="default"
                            className="flex-1"
                            onClick={onClose}
                        >
                            Close
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
