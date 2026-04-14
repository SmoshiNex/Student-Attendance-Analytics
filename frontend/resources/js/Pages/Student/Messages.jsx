import { useEffect, useRef, useState, useCallback } from "react"
import axios from "axios"
import { useNavigate } from "react-router-dom"
import {
  MessageSquare, Send, Search, CheckCheck, Clock,
  Wifi, WifiOff, ChevronLeft, Paperclip, FileText, Download, X, ZoomIn,
} from "lucide-react"
import Header from "./DashboardUI/Header"
import { authApiUrl, messagesApiUrl, teacherClassApiUrl } from "@/lib/nativeApi"
import { useSocket } from "@/hooks/useSocket"

// ── helpers ──────────────────────────────────────────────────
const fmt = (iso) => {
  if (!iso) return ""
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" })
}

const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")

// ── Attachment preview inside a message bubble ─────────────
function AttachmentBubble({ msg, isOwn }) {
  const [lightbox, setLightbox] = useState(false)
  if (!msg.attachment_url) return null

  const url  = msg.attachment_url
  const name = msg.attachment_name || "attachment"
  const type = msg.attachment_type || "file"

  if (type === "image") {
    return (
      <>
        <div className="mt-1 cursor-pointer rounded-xl overflow-hidden max-w-[220px] border border-white/20" onClick={() => setLightbox(true)}>
          <img src={url} alt={name} className="w-full object-cover max-h-48 hover:opacity-90 transition-opacity" />
          <div className={`flex items-center gap-1 px-2 py-1 text-[10px] ${isOwn ? "text-gray-400" : "text-gray-500"}`}>
            <ZoomIn className="w-3 h-3" /> Tap to enlarge
          </div>
        </div>
        {lightbox && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(false)}>
            <button className="absolute top-4 right-4 text-white bg-white/20 rounded-full p-2 hover:bg-white/30" onClick={() => setLightbox(false)}>
              <X className="w-5 h-5" />
            </button>
            <img src={url} alt={name} className="max-w-full max-h-[90vh] rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
            <a href={url} download={name}
              className="absolute bottom-6 bg-white text-gray-900 rounded-full px-4 py-2 text-sm font-medium flex items-center gap-1.5 hover:bg-gray-100"
              onClick={(e) => e.stopPropagation()}>
              <Download className="w-4 h-4" /> Download
            </a>
          </div>
        )}
      </>
    )
  }

  return (
    <a href={url} download={name} target="_blank" rel="noopener noreferrer"
      className={`mt-1 flex items-center gap-2 rounded-xl px-3 py-2 border max-w-[240px] hover:opacity-80 transition-opacity ${
        isOwn ? "bg-white/10 border-white/20 text-white" : "bg-gray-100 border-gray-200 text-gray-800"
      }`}>
      <FileText className="w-5 h-5 shrink-0" />
      <span className="text-xs font-medium truncate flex-1">{name}</span>
      <Download className="w-3.5 h-3.5 shrink-0 opacity-60" />
    </a>
  )
}

// ── component ─────────────────────────────────────────────────
export default function StudentMessages() {
  const navigate = useNavigate()
  const socket   = useSocket()

  const [student, setStudent]           = useState(null)
  const [threads, setThreads]           = useState([])
  const [teachers, setTeachers]         = useState([])
  const [activeThread, setActiveThread] = useState(null)
  const [messages, setMessages]         = useState([])
  const [draft, setDraft]               = useState("")
  const [sending, setSending]           = useState(false)
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [loadingMsgs, setLoadingMsgs]   = useState(false)
  const [searchQuery, setSearchQuery]   = useState("")
  const [typingFrom, setTypingFrom]     = useState(null)
  const [isConnected, setIsConnected]   = useState(socket.connected)
  const [showNewChat, setShowNewChat]   = useState(false)
  const [mobilePanel, setMobilePanel]   = useState("sidebar")

  // attachment state
  const [pendingFile, setPendingFile]     = useState(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef  = useRef(null)
  const messagesEndRef = useRef(null)
  const typingTimerRef = useRef(null)

  // ── load student ──────────────────────────────────────────
  useEffect(() => {
    axios.get(authApiUrl("current_student"), { withCredentials: true })
      .then((res) => {
        const s = res.data?.student
        if (!s) { navigate("/", { replace: true }); return }
        setStudent(s)
      })
      .catch(() => navigate("/", { replace: true }))
  }, [navigate])

  // ── socket register ───────────────────────────────────────
  useEffect(() => {
    if (!student) return
    socket.emit("register", { user_type: "student", user_id: student.id })
    const onConnect    = () => setIsConnected(true)
    const onDisconnect = () => setIsConnected(false)
    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    setIsConnected(socket.connected)
    return () => { socket.off("connect", onConnect); socket.off("disconnect", onDisconnect) }
  }, [student, socket])

  // ── inbox ─────────────────────────────────────────────────
  const loadInbox = useCallback(() => {
    if (!student) return
    axios.get(messagesApiUrl("inbox", { user_type: "student", user_id: student.id }), { withCredentials: true })
      .then((res) => setThreads(res.data?.threads || []))
      .catch(console.error)
      .finally(() => setLoadingInbox(false))
  }, [student])
  useEffect(() => { loadInbox() }, [loadInbox])

  // ── teachers from enrolled classes ───────────────────────
  useEffect(() => {
    if (!student) return
    axios.get(teacherClassApiUrl({ action: "my_classes" }), { withCredentials: true })
      .then((res) => {
        const seen = new Set()
        const unique = (res.data?.classes || []).reduce((acc, cls) => {
          const t = cls.teacher || {}
          if (t.id && !seen.has(t.id)) {
            seen.add(t.id)
            acc.push({ id: t.id, name: [t.first_name, t.last_name].filter(Boolean).join(" ").trim() || "Teacher" })
          }
          return acc
        }, [])
        setTeachers(unique)
      })
      .catch(console.error)
  }, [student])

  // ── conversation ──────────────────────────────────────────
  const loadConversation = useCallback((thread) => {
    if (!student) return
    setLoadingMsgs(true); setMessages([])
    axios.get(messagesApiUrl("conversation", {
      sender_type: "student", sender_id: student.id,
      receiver_type: thread.partner_type, receiver_id: thread.partner_id, limit: 60,
    }), { withCredentials: true })
      .then((res) => setMessages(res.data?.messages || []))
      .catch(console.error).finally(() => setLoadingMsgs(false))

    axios.post(messagesApiUrl("mark_read"), {
      reader_type: "student", reader_id: student.id,
      sender_type: thread.partner_type, sender_id: thread.partner_id,
    }, { withCredentials: true }).then(() => loadInbox()).catch(console.error)
  }, [student, loadInbox])

  // ── socket events ─────────────────────────────────────────
  useEffect(() => {
    if (!student) return
    const onReceive = (msg) => {
      loadInbox()
      setActiveThread((cur) => {
        if (cur && msg.sender_type === cur.partner_type && Number(msg.sender_id) === Number(cur.partner_id)) {
          setMessages((prev) => [...prev, msg])
          axios.post(messagesApiUrl("mark_read"), {
            reader_type: "student", reader_id: student.id,
            sender_type: msg.sender_type, sender_id: msg.sender_id,
          }, { withCredentials: true }).catch(console.error)
        }
        return cur
      })
    }
    const onTyping = ({ sender_type, sender_id, is_typing }) => {
      setActiveThread((cur) => {
        if (cur && sender_type === cur.partner_type && Number(sender_id) === Number(cur.partner_id))
          setTypingFrom(is_typing ? sender_id : null)
        return cur
      })
    }
    socket.on("receive_message", onReceive)
    socket.on("typing", onTyping)
    return () => { socket.off("receive_message", onReceive); socket.off("typing", onTyping) }
  }, [student, socket, loadInbox])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  // ── attachment pick ───────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null
    const category   = file.type.startsWith("image/") ? "image" : file.type === "application/pdf" ? "pdf" : "file"
    setPendingFile({ file, previewUrl, name: file.name, type: category })
    e.target.value = ""
  }
  const clearPendingFile = () => {
    if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl)
    setPendingFile(null)
  }

  // ── send ──────────────────────────────────────────────────
  const sendMessage = async () => {
    if ((!draft.trim() && !pendingFile) || !activeThread || !student || sending) return
    setSending(true)

    let attachmentUrl = null, attachmentType = null, attachmentName = null

    if (pendingFile) {
      setUploadingFile(true)
      try {
        const fd = new FormData()
        fd.append("file", pendingFile.file)
        const res = await axios.post(messagesApiUrl("upload_attachment"), fd, {
          withCredentials: true,
          headers: { "Content-Type": "multipart/form-data" },
        })
        attachmentUrl  = res.data.attachment_url
        attachmentType = res.data.attachment_type
        attachmentName = res.data.attachment_name
      } catch (err) {
        console.error("Upload failed:", err)
        setSending(false); setUploadingFile(false)
        return
      }
      setUploadingFile(false)
      clearPendingFile()
    }

    const payload = {
      sender_type: "student", sender_id: student.id,
      receiver_type: activeThread.partner_type, receiver_id: activeThread.partner_id,
      message: draft.trim(),
      attachment_url: attachmentUrl, attachment_type: attachmentType, attachment_name: attachmentName,
    }
    socket.emit("send_message", payload)
    setMessages((prev) => [...prev, {
      ...payload, id: `tmp-${Date.now()}`, created_at: new Date().toISOString(), is_read: 0,
      sender_name: `${student.first_name} ${student.last_name}`,
    }])
    setDraft("")
    setSending(false)
    loadInbox()
  }

  const handleDraftChange = (e) => {
    setDraft(e.target.value)
    if (!activeThread || !student) return
    socket.emit("typing", { sender_type: "student", sender_id: student.id, receiver_type: activeThread.partner_type, receiver_id: activeThread.partner_id, is_typing: true })
    clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() =>
      socket.emit("typing", { sender_type: "student", sender_id: student.id, receiver_type: activeThread.partner_type, receiver_id: activeThread.partner_id, is_typing: false }), 1500)
  }

  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }

  const openThread = (thread) => { setActiveThread(thread); setShowNewChat(false); setMobilePanel("chat"); loadConversation(thread) }
  const startNewChat = (t) => {
    if (!t.id) return
    const thread = { partner_type: "teacher", partner_id: t.id, partner_name: t.name }
    setActiveThread(thread); setShowNewChat(false); setMobilePanel("chat"); loadConversation(thread)
  }
  const goBackToSidebar = () => { setMobilePanel("sidebar"); setShowNewChat(false) }

  const filteredThreads = threads.filter((t) => t.partner_name?.toLowerCase().includes(searchQuery.toLowerCase()))
  const canSend = (draft.trim() || pendingFile) && !sending && !uploadingFile

  // ── render ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100 student-shell">
      <Header active="messages" />
      <main className="max-w-7xl mx-auto py-0 sm:py-6 px-0 sm:px-6 lg:px-8">
        <div className="bg-white sm:rounded-xl shadow-sm overflow-hidden flex h-[calc(100vh-4rem)] sm:h-[calc(100vh-8rem)] border-0 sm:border border-gray-200">

          {/* Sidebar */}
          <div className={`flex flex-col border-r border-gray-200 shrink-0 w-full md:w-80 ${mobilePanel === "sidebar" ? "flex" : "hidden"} md:flex`}>
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-gray-700" />
                <h1 className="text-base font-semibold text-gray-900">Messages</h1>
              </div>
              <div className="flex items-center gap-2">
                {isConnected
                  ? <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><Wifi className="w-3.5 h-3.5" /> Live</span>
                  : <span className="flex items-center gap-1 text-xs text-red-400 font-medium"><WifiOff className="w-3.5 h-3.5" /> Offline</span>}
                {teachers.length > 0 && (
                  <button onClick={() => setShowNewChat((v) => !v)}
                    className="text-xs bg-gray-900 text-white rounded-lg px-2.5 py-1 hover:bg-gray-700 transition-colors font-medium">
                    + New
                  </button>
                )}
              </div>
            </div>

            {/* New chat teacher picker */}
            {showNewChat && (
              <div className="border-b border-gray-100 bg-blue-50 px-3 py-2">
                <p className="text-xs text-blue-700 font-semibold mb-1.5">Message a Teacher</p>
                <div className="flex flex-col gap-1">
                  {teachers.map((t) => (
                    <button key={t.id} onClick={() => startNewChat(t)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-100 active:bg-blue-200 text-sm text-gray-800 flex items-center gap-2 transition-colors">
                      <div className="h-7 w-7 rounded-full bg-gray-900 text-white text-xs font-semibold flex items-center justify-center shrink-0">{initials(t.name)}</div>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="px-3 py-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" placeholder="Search conversations..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-gray-100 border-0 focus:ring-1 focus:ring-gray-300 outline-none" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingInbox ? <div className="py-10 text-center text-sm text-gray-400">Loading...</div>
                : filteredThreads.length === 0 ? (
                  <div className="py-10 text-center">
                    <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No conversations yet.</p>
                    {teachers.length > 0 && (
                      <button onClick={() => setShowNewChat(true)} className="mt-2 text-xs text-blue-600 hover:underline">
                        Start a conversation with your teacher
                      </button>
                    )}
                  </div>
                ) : filteredThreads.map((thread) => {
                  const isActive = activeThread?.partner_id === thread.partner_id && activeThread?.partner_type === thread.partner_type
                  return (
                    <button key={`${thread.partner_type}_${thread.partner_id}`} onClick={() => openThread(thread)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors flex items-start gap-3 ${isActive ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>
                      <div className={`h-9 w-9 rounded-full font-semibold text-sm flex items-center justify-center shrink-0 ${isActive ? "bg-white text-gray-900" : "bg-gray-200 text-gray-700"}`}>
                        {initials(thread.partner_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm font-semibold truncate ${isActive ? "text-white" : "text-gray-900"}`}>{thread.partner_name}</p>
                          <span className={`text-[10px] shrink-0 ml-1 ${isActive ? "text-gray-300" : "text-gray-400"}`}>{fmt(thread.created_at)}</span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className={`text-xs truncate ${isActive ? "text-gray-300" : "text-gray-500"}`}>
                            {thread.attachment_url && !thread.message ? "📎 Attachment" : thread.message?.slice(0, 45)}
                          </p>
                          {thread.unread_count > 0 && !isActive && (
                            <span className="ml-1 bg-black text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                              {thread.unread_count > 9 ? "9+" : thread.unread_count}
                            </span>
                          )}
                        </div>
                        <p className={`text-[10px] mt-0.5 capitalize ${isActive ? "text-gray-400" : "text-gray-400"}`}>Teacher</p>
                      </div>
                    </button>
                  )
                })}
            </div>
          </div>

          {/* Chat area */}
          <div className={`flex-1 flex flex-col min-w-0 ${mobilePanel === "chat" ? "flex" : "hidden"} md:flex`}>
            {!activeThread ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <MessageSquare className="w-14 h-14 text-gray-200 mb-4" />
                <h2 className="text-lg font-semibold text-gray-700 mb-1">Select a Conversation</h2>
                <p className="text-sm text-gray-400">Choose a teacher from the list or tap <strong className="text-gray-600">+ New</strong> to start a chat.</p>
              </div>
            ) : (
              <>
                {/* Chat Header */}
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
                  <button onClick={goBackToSidebar} className="md:hidden text-gray-500 hover:text-gray-800 p-1 -ml-1 rounded-lg" aria-label="Back"><ChevronLeft className="w-5 h-5" /></button>
                  <div className="h-9 w-9 rounded-full bg-gray-900 text-white font-semibold text-sm flex items-center justify-center shrink-0">{initials(activeThread.partner_name)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{activeThread.partner_name}</p>
                    <p className="text-xs text-gray-400 capitalize">Teacher</p>
                  </div>
                  <div className="shrink-0">
                    {isConnected
                      ? <span className="text-xs text-green-600 font-medium flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block animate-pulse" /> Live</span>
                      : <span className="text-xs text-red-400">Reconnecting…</span>}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
                  {loadingMsgs ? <div className="text-center text-sm text-gray-400 py-10">Loading messages...</div>
                    : messages.length === 0 ? <div className="text-center text-sm text-gray-400 py-10">No messages yet. Say hello! 👋</div>
                    : messages.map((msg) => {
                      const isOwn = msg.sender_type === "student" && Number(msg.sender_id) === Number(student?.id)
                      return (
                        <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                          {!isOwn && (
                            <div className="h-7 w-7 rounded-full bg-gray-200 text-gray-600 text-xs font-semibold flex items-center justify-center mr-2 mt-1 shrink-0">{initials(activeThread.partner_name)}</div>
                          )}
                          <div className={`max-w-[75%] sm:max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow-sm ${isOwn ? "bg-gray-900 text-white rounded-br-sm" : "bg-white text-gray-800 rounded-bl-sm border border-gray-100"}`}>
                            {msg.message && <p className="leading-relaxed break-words">{msg.message}</p>}
                            <AttachmentBubble msg={msg} isOwn={isOwn} />
                            <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                              <Clock className={`w-2.5 h-2.5 ${isOwn ? "text-gray-400" : "text-gray-300"}`} />
                              <span className="text-[10px] text-gray-400">{fmt(msg.created_at)}</span>
                              {isOwn && msg.is_read ? <CheckCheck className="w-3 h-3 text-blue-300 ml-0.5" /> : null}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  {typingFrom && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-2 shadow-sm flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* File preview strip */}
                {pendingFile && (
                  <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-3">
                    {pendingFile.type === "image" ? (
                      <img src={pendingFile.previewUrl} alt="preview" className="h-14 w-14 rounded-lg object-cover border border-gray-200 shrink-0" />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-gray-200 flex items-center justify-center shrink-0">
                        <FileText className="w-6 h-6 text-gray-500" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800 truncate">{pendingFile.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{pendingFile.type.toUpperCase()} • Ready to send</p>
                    </div>
                    <button onClick={clearPendingFile} className="text-gray-400 hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                )}

                {/* Input */}
                <div className="px-3 py-3 border-t border-gray-100 bg-white flex items-end gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={handleFileChange} />
                  <button onClick={() => fileInputRef.current?.click()} title="Attach file or photo"
                    className="h-10 w-10 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-800 flex items-center justify-center transition-colors shrink-0">
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <textarea rows={1} value={draft} onChange={handleDraftChange} onKeyDown={handleKeyDown}
                    placeholder="Type a message…"
                    className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent max-h-28 overflow-y-auto"
                    style={{ minHeight: "42px" }} />
                  <button onClick={sendMessage} disabled={!canSend}
                    className="h-10 w-10 rounded-xl bg-gray-900 text-white hover:bg-gray-700 active:bg-gray-600 disabled:opacity-40 flex items-center justify-center transition-colors shrink-0">
                    {uploadingFile ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
