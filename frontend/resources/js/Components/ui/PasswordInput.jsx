import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/Components/ui/input"

export default function PasswordInput({
  value,
  onChange,
  placeholder = "Password",
  className = "",
  ...props
}) {
  const [show, setShow] = useState(false)
  const hasValue = value && value.length > 0

  return (
    <div className="relative">
      <Input
        {...props}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`pr-10 ${className}`}
      />
      {hasValue && (
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
    </div>
  )
}
