export function evaluatePasswordPolicy(password = "") {
  const value = String(password || "")

  const checks = [
    {
      key: "length",
      label: "At least 8 characters",
      passed: value.length >= 8,
    },
    {
      key: "number",
      label: "At least 1 number",
      passed: /\d/.test(value),
    },
    {
      key: "lowercase",
      label: "At least 1 lowercase letter",
      passed: /[a-z]/.test(value),
    },
    {
      key: "uppercase",
      label: "At least 1 uppercase letter",
      passed: /[A-Z]/.test(value),
    },
  ]

  const passedCount = checks.filter((check) => check.passed).length
  const progress = Math.round((passedCount / checks.length) * 100)

  let tone = "red"
  let label = "Weak"

  if (passedCount === checks.length) {
    tone = "green"
    label = "Strong"
  } else if (passedCount === 3) {
    tone = "amber"
    label = "Good"
  } else if (passedCount === 2) {
    tone = "orange"
    label = "Fair"
  }

  return {
    checks,
    passedCount,
    progress,
    tone,
    label,
    isValid: passedCount === checks.length,
  }
}

export function getPasswordPolicyError(password = "") {
  const policy = evaluatePasswordPolicy(password)
  if (policy.isValid) {
    return ""
  }

  return "Password must contain at least 8 characters, 1 number, 1 lowercase letter, and 1 uppercase letter."
}
