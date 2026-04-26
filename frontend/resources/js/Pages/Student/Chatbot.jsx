import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import axios from "axios"
import { MessageCircle, Send } from "lucide-react"
import Header from "./DashboardUI/Header"
import { authApiUrl, chatbotApiUrl } from "@/lib/nativeApi"

const quickPrompts = [
  "How can I improve my attendance rate this week?",
  "What should I do if I missed a class check-in?",
  "Explain what counts as late versus absent.",
]

// All suggestion prompts for the input dropdown
const allSuggestions = [
  "How can I improve my attendance rate this week?",
  "What should I do if I missed a class check-in?",
  "Explain what counts as late versus absent.",
  "What are my classes?",
  "Who are my classmates?",
  "Who is my teacher?",
  "What is my attendance rate?",
  "How many times was I absent?",
  "How many times was I present?",
  "Show my attendance summary",
  "Am I at risk?",
  "What is my schedule?",
  "What room is my class?",
  "Do I have notifications?",
  "How many unread notifications do I have?",
  "How do I check in using QR?",
  "What can you help me with?",
]

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

export default function StudentChatbot() {
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [input, setInput] = useState("")
  const [error, setError] = useState("")
  const [messages, setMessages] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  useEffect(() => {
    let mounted = true
    axios
      .get(authApiUrl("current_student"), { withCredentials: true })
      .then((res) => {
        if (!mounted) return
        const profile = res.data?.student
        if (!profile) { navigate("/", { replace: true }); return }
        setStudent(profile)
        setMessages([{
          id: makeId(),
          role: "assistant",
          content: `Hi ${profile.first_name || "there"}! I am your student assistant. Ask me about attendance, classes, notifications, and how to use this portal.`,
        }])
      })
      .catch(() => { if (!mounted) return; navigate("/", { replace: true }) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [navigate])

  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, isSending])

  // Filter suggestions based on input
  const filteredSuggestions = useMemo(() => {
    const q = input.trim().toLowerCase()
    if (!q) return []
    return allSuggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 5)
  }, [input])

  const canSend = useMemo(() => !isSending && input.trim().length > 0, [input, isSending])

  const sendMessage = async (rawText) => {
    const text = String(rawText || "").trim()
    if (!text || isSending) return

    setShowSuggestions(false)
    const history = messages.slice(-10).map((item) => ({ role: item.role, content: item.content }))
    setMessages((prev) => [...prev, { id: makeId(), role: "user", content: text }])
    setInput("")
    setError("")
    setIsSending(true)

    try {
      const res = await axios.post(chatbotApiUrl("student_chat"), { message: text, history }, { withCredentials: true })
      const assistantReply = String(res.data?.reply || "").trim() || "I could not generate a response right now. Please try again."
      setMessages((prev) => [...prev, { id: makeId(), role: "assistant", content: assistantReply }])
    } catch (err) {
      if (err?.response?.status === 401) { navigate("/", { replace: true }); return }
      setError(err?.response?.data?.message || "Chatbot is temporarily unavailable. Please try again in a moment.")
      setMessages((prev) => [...prev, { id: makeId(), role: "assistant", content: "I could not respond right now. Please try again shortly." }])
    } finally {
      setIsSending(false)
    }
  }

  const handleSubmit = async (e) => { e.preventDefault(); await sendMessage(input) }

  const handlePromptClick = async (prompt) => {
    setShowSuggestions(false)
    await sendMessage(prompt)
  }

  const handleInputChange = (e) => {
    setInput(e.target.value)
    setShowSuggestions(e.target.value.trim().length > 0)
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-500">Loading...</p></div>
  }

  return (
    <div className="min-h-screen bg-gray-50 student-shell">
      <Header active="chatbot" />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Student Chatbot</h1>
          <p className="text-sm text-gray-500">Ask questions about attendance workflows, class participation, and using this portal.</p>
          {student?.student_id && (
            <p className="text-xs text-gray-400 mt-1">Session active for Student ID: {student.student_id}</p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col h-[70vh]">

          {/* Header */}
          <div className="border-b border-gray-200 px-4 py-3 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-gray-600" />
            <p className="text-sm font-medium text-gray-700">Live Assistant</p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                  message.role === "user"
                    ? "bg-black text-white rounded-br-md"
                    : "bg-white text-gray-800 border border-gray-200 rounded-bl-md"
                }`}>
                  {message.content}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex justify-start">
                <div className="max-w-[90%] sm:max-w-[78%] rounded-2xl rounded-bl-md px-4 py-3 text-sm bg-white text-gray-500 border border-gray-200">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          {/* Bottom panel */}
          <div className="border-t border-gray-200 p-3 sm:p-4 bg-white rounded-b-2xl space-y-3">

            {/* Quick prompts — always visible */}
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handlePromptClick(prompt)}
                  disabled={isSending}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 disabled:opacity-60 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {error && <p className="text-xs text-red-600" role="alert">{error}</p>}

            {/* Input with suggestion dropdown */}
            <div className="relative">
              {/* Suggestion dropdown */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10">
                  {filteredSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); handlePromptClick(s) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onFocus={() => { if (input.trim()) setShowSuggestions(true) }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (canSend) handleSubmit(e) }
                    if (e.key === "Escape") setShowSuggestions(false)
                  }}
                  rows={2}
                  maxLength={1500}
                  placeholder="Type your question..."
                  className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  disabled={isSending}
                />
                <button
                  type="submit"
                  disabled={!canSend}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}
