import { Check, X } from "lucide-react"
import { evaluatePasswordPolicy } from "@/utils/passwordPolicy"

const toneStyles = {
  red: {
    bar: "bg-red-500",
    text: "text-red-600",
  },
  orange: {
    bar: "bg-orange-500",
    text: "text-orange-600",
  },
  amber: {
    bar: "bg-amber-500",
    text: "text-amber-600",
  },
  green: {
    bar: "bg-green-500",
    text: "text-green-600",
  },
}

export default function PasswordStrengthChecklist({ password = "" }) {
  if (!password) {
    return null
  }

  const policy = evaluatePasswordPolicy(password)
  const tone = toneStyles[policy.tone] || toneStyles.red

  return (
    <div className="mt-2 space-y-2">
      <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${tone.bar}`}
          style={{ width: `${policy.progress}%` }}
        />
      </div>

      <p className={`text-sm font-semibold ${tone.text}`}>
        {policy.label} password.
        <span className="font-normal text-gray-600 ml-1">Must contain:</span>
      </p>

      <div className="space-y-1 text-sm">
        {policy.checks.map((check) => (
          <p
            key={check.key}
            className={`flex items-center gap-2 ${
              check.passed ? "text-green-600" : "text-gray-500"
            }`}
          >
            {check.passed ? (
              <Check className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
            <span>{check.label}</span>
          </p>
        ))}
      </div>
    </div>
  )
}
