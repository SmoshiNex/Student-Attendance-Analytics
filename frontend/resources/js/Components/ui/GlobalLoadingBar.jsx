import { useEffect, useRef, useState } from "react"

export default function GlobalLoadingBar() {
  const [activeRequests, setActiveRequests] = useState(0)
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)

  const progressTimerRef = useRef(null)
  const hideTimerRef = useRef(null)

  useEffect(() => {
    const handleLoadingEvent = (event) => {
      const nextCount = Number(event?.detail?.active || 0)
      setActiveRequests(Number.isFinite(nextCount) ? Math.max(0, nextCount) : 0)
    }

    window.addEventListener("app:network-loading", handleLoadingEvent)

    return () => {
      window.removeEventListener("app:network-loading", handleLoadingEvent)
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current)
      }
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (activeRequests > 0) {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }

      setVisible(true)
      setProgress((prev) => (prev > 12 ? prev : 12))

      if (!progressTimerRef.current) {
        progressTimerRef.current = window.setInterval(() => {
          setProgress((prev) => {
            if (prev >= 90) {
              return prev
            }
            if (prev < 40) {
              return prev + 8
            }
            if (prev < 70) {
              return prev + 4
            }
            return prev + 1
          })
        }, 140)
      }

      return
    }

    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }

    if (!visible) {
      return
    }

    setProgress(100)
    hideTimerRef.current = window.setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, 260)
  }, [activeRequests, visible])

  return (
    <div
      className={`fixed left-0 top-0 z-[9999] h-1 w-full pointer-events-none transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className="h-full bg-black transition-[width] duration-150 ease-out"
        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
      />
    </div>
  )
}
