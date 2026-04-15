import { CheckCircle, XCircle, AlertTriangle } from "lucide-react"

function Overlay({ onClose, children }) {
  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[9000] animate-in fade-in-0 duration-200"
        onClick={onClose}
      />
      <div className="fixed inset-0 flex items-center justify-center z-[9001] p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 sm:slide-in-from-top-2 duration-200">
          {children}
        </div>
      </div>
    </>
  )
}

export function SuccessModal({ open, title = "Success!", message, onClose }) {
  if (!open) return null
  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 text-center">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-in zoom-in-75 duration-300">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        {message && <p className="text-sm text-gray-600 mb-5">{message}</p>}
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          OK
        </button>
      </div>
    </Overlay>
  )
}

export function ErrorModal({
  open,
  title = "Something went wrong",
  message,
  onClose,
}) {
  if (!open) return null
  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-in zoom-in-75 duration-300">
          <XCircle className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        {message && <p className="text-sm text-gray-600 mb-5">{message}</p>}
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          Close
        </button>
      </div>
    </Overlay>
  )
}

export function ConfirmModal({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  danger = false,
}) {
  if (!open) return null
  return (
    <Overlay onClose={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${danger ? "bg-red-100" : "bg-yellow-100"}`}
          >
            <AlertTriangle
              className={`w-6 h-6 ${danger ? "text-red-600" : "text-yellow-600"}`}
            />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            {message && (
              <p className="text-sm text-gray-500 mt-0.5">{message}</p>
            )}
          </div>
        </div>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2.5 text-white rounded-lg font-medium transition-all hover:scale-[1.01] active:scale-[0.99] ${danger ? "bg-red-600 hover:bg-red-700" : "bg-black hover:bg-gray-800"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
