export default function CameraView({ videoRef, isScanning, error }) {
    return (
        <div className="w-full flex justify-center">
            <div className="w-full max-w-[16rem] sm:max-w-sm aspect-square bg-black rounded-2xl flex items-center justify-center overflow-hidden relative border border-gray-200 shadow-inner">
                <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                    muted
                    webkit-playsinline="true"
                    x5-playsinline="true"
                />
                {!isScanning && !error && (
                    <span className="absolute text-xs text-gray-300">
                        Camera preview
                    </span>
                )}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80 p-4">
                        <div className="text-xs text-red-300 text-center whitespace-pre-line max-w-full">
                            {error}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

