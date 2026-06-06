"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Scripture } from "./types";

interface Citation {
  index: number;
  bookId: string;
  bookTitle: string;
  pageNumber: number;
  paraNumber: number | null;
  gathaNumber: string | null;
  gathaRange: string | null;
  chapterNumber: number | null;
  preview: string;
  score: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

const SUGGESTED = [
  "What are the 5 types of jiva bhavas?",
  "How does karma bind to the soul according to Tattvartha Sutra?",
  "Explain Anekantavada and Syadvada",
  "What is the path to moksha in Jainism?",
  "Difference between Samyagdarshana, Samyagjnana and Samyakcharitra",
  "What are the 14 gunasthanas?",
  "Explain the nature of Pudgal (matter) in Jain philosophy",
  "What is Sarvarthasiddhi's commentary on right faith?",
];

// Detect dominant script: Devanagari → hi-IN, else en-US
function detectLang(text: string): string {
  const devaChars = (text.match(/[ऀ-ॿ]/g) || []).length;
  return devaChars / Math.max(text.length, 1) > 0.2 ? "hi-IN" : "en-US";
}

// Strip citation markers [N] and markdown for cleaner speech
function cleanForSpeech(text: string): string {
  return text
    .replace(/\[\d+\]/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
}

export default function ChatBot() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [scriptures, setScriptures] = useState<Scripture[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedScriptureId, setSelectedScriptureId] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setMounted(true);
    const check = () => setIsDesktop(window.innerWidth >= 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const cached = localStorage.getItem("scripture_library_cache");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Support both old format (array) and new format ({scriptures, fetchedAt})
        const list = Array.isArray(parsed) ? parsed : parsed.scriptures ?? [];
        setScriptures(list);
      } catch { /* ignore */ }
    }
  }, [isOpen]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, messages.length, scrollToBottom]);

  const handleSend = async () => {
    const query = input.trim();
    if (!query || isStreaming) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: query };
    const asstId = (Date.now() + 1).toString();
    const asstMsg: Message = { id: asstId, role: "assistant", content: "", isStreaming: true };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg, asstMsg]);
    setInput("");
    setIsStreaming(true);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, messages: history, scriptureId: selectedScriptureId || undefined }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Request failed (${res.status})`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let citations: Citation[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const event = JSON.parse(raw);
            if (event.type === "token") {
              setMessages((prev) =>
                prev.map((m) => m.id === asstId ? { ...m, content: m.content + event.content } : m)
              );
            } else if (event.type === "replace_content") {
              // Server renumbered citations 1…N — replace streamed text wholesale
              setMessages((prev) =>
                prev.map((m) => m.id === asstId ? { ...m, content: event.content } : m)
              );
            } else if (event.type === "citations") {
              citations = event.data;
            }
          } catch { /* skip malformed */ }
        }
      }

      setMessages((prev) =>
        prev.map((m) => m.id === asstId ? { ...m, isStreaming: false, citations } : m)
      );
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === asstId
            ? { ...m, content: err.message || "Something went wrong. Please try again.", isStreaming: false }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages((prev) => prev.map((m) => m.isStreaming ? { ...m, isStreaming: false } : m));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handleClose = () => {
    stopSpeaking();
    stopListening();
    setIsOpen(false);
    setIsExpanded(false);
  };

  // ── TTS (Web Speech API) ──────────────────────────────────────────────────
  const speak = useCallback((text: string, msgId: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = cleanForSpeech(text);
    if (!clean) return;
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = detectLang(clean);
    utter.rate = 0.9;
    utter.onstart = () => setSpeakingId(msgId);
    utter.onend = () => setSpeakingId(null);
    utter.onerror = () => setSpeakingId(null);
    window.speechSynthesis.speak(utter);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
  }, []);

  // ── STT (Web Speech API) ──────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported in this browser. Use Chrome."); return; }
    stopSpeaking();
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = "hi-IN";          // hi-IN handles both Hindi and English queries
    rec.interimResults = true;
    rec.continuous = false;
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as SpeechRecognitionResultList)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join("");
      setInput(transcript);
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
        inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
      }
    };
    rec.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      // Focus input so user can review + press Enter to send
      setTimeout(() => inputRef.current?.focus(), 100);
    };
    rec.onerror = () => { setIsListening(false); recognitionRef.current = null; };
    rec.start();
  }, [stopSpeaking]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // ── Panel geometry (JS-driven — Tailwind JIT can't scan dynamic strings) ──
  const getPanelStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "fixed",
      zIndex: 50,
      transition: "transform 0.3s cubic-bezier(0.32,0.72,0,1), opacity 0.2s, scale 0.2s",
    };
    if (isExpanded) {
      return { ...base, inset: 0, borderRadius: 0, opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? "auto" : "none" };
    }
    if (isDesktop) {
      // FB Messenger-style corner popup
      return {
        ...base,
        bottom: 96,
        right: 24,
        width: 360,
        height: 560,
        borderRadius: 16,
        transform: isOpen ? "translateY(0) scale(1)" : "translateY(12px) scale(0.95)",
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? "auto" : "none",
      };
    }
    // Mobile: bottom sheet
    return {
      ...base,
      bottom: 0,
      left: 0,
      right: 0,
      height: "85dvh",
      borderRadius: "20px 20px 0 0",
      transform: isOpen ? "translateY(0)" : "translateY(100%)",
      opacity: isOpen ? 1 : 0,
      pointerEvents: isOpen ? "auto" : "none",
    };
  };

  if (!mounted) return null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          style={{ backdropFilter: isExpanded ? "none" : "blur(2px)" }}
          onClick={isExpanded ? undefined : handleClose}
        />
      )}

      {/* FAB — hidden when expanded */}
      {!isExpanded && (
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
          aria-label={isOpen ? "Close chat" : "Open scripture chat"}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: isOpen ? "scale(0)" : "scale(1)", position: "absolute", transition: "transform 0.2s" }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: isOpen ? "scale(1)" : "scale(0)", position: "absolute", transition: "transform 0.2s" }}>
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      {/* Chat panel */}
      <div
        className="flex flex-col overflow-hidden bg-white border border-gray-200 shadow-2xl"
        style={getPanelStyle()}
      >
        <div
          className="flex flex-col w-full h-full bg-white overflow-hidden"
          style={isExpanded ? { maxWidth: 800, margin: "0 auto" } : undefined}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ borderBottom: "1px solid #f0f0f0", background: "linear-gradient(135deg, #faf5ff, #eef2ff)" }}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Ask Aagam</p>
              <p className="text-xs text-gray-500 truncate">Jain scripture Q&amp;A with citations</p>
            </div>
            {messages.length > 0 && (
              <button onClick={() => setMessages([])}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-white/60 transition-colors">
                Clear
              </button>
            )}
            {/* Expand / collapse */}
            <button
              onClick={() => setIsExpanded((v) => !v)}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-white/60 transition-colors"
              title={isExpanded ? "Collapse" : "Expand to full page"}
            >
              {isExpanded ? (
                // Arrows inward (collapse)
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
                  <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
                </svg>
              ) : (
                // Arrows outward (expand)
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                  <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
              )}
            </button>
            <button onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-white/60 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Scripture filter */}
          <div className="px-4 py-2.5 flex-shrink-0" style={{ borderBottom: "1px solid #f5f5f5" }}>
            <select
              value={selectedScriptureId}
              onChange={(e) => setSelectedScriptureId(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ "--tw-ring-color": "#7c3aed" } as React.CSSProperties}
            >
              <option value="">All Scriptures</option>
              {scriptures.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>

          {/* Messages */}
          <div className={`flex-1 overflow-y-auto py-4 space-y-4 ${isExpanded ? "px-4 sm:px-8" : "px-4"}`}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #f3e8ff, #e0e7ff)" }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Ask about Jain scriptures</p>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Get answers grounded in the Aagams,<br />with exact page citations
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center mt-1">
                  {SUGGESTED.map((q) => (
                    <button key={q} onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 50); }}
                      className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                      style={{ borderColor: "#d8b4fe", color: "#7c3aed" }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`space-y-2 ${isExpanded ? "max-w-[75%] sm:max-w-[65%]" : "max-w-[85%]"}`}>
                  <div
                    className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
                    style={
                      msg.role === "user"
                        ? { background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "white", borderBottomRightRadius: "4px" }
                        : { background: "#f3f4f6", color: "#1f2937", borderBottomLeftRadius: "4px" }
                    }
                  >
                    {msg.isStreaming && !msg.content ? (
                      <span className="flex gap-1 items-center py-0.5">
                        {[0, 150, 300].map((delay) => (
                          <span key={delay} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                        ))}
                      </span>
                    ) : (
                      <>
                        <span style={{ whiteSpace: "pre-wrap" }}>
                          {msg.content.split(/(\[\d+\])/).map((part, i) => {
                            const m = part.match(/^\[(\d+)\]$/);
                            if (m) {
                              return (
                                <sup key={i} style={{ color: "#7c3aed", fontWeight: 700, fontSize: "0.7em", cursor: "pointer" }}>
                                  [{m[1]}]
                                </sup>
                              );
                            }
                            return <span key={i}>{part}</span>;
                          })}
                        </span>
                        {msg.isStreaming && (
                          <span className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse" style={{ background: "currentColor" }} />
                        )}
                      </>
                    )}
                  </div>

                  {/* TTS button on completed assistant messages */}
                  {msg.role === "assistant" && !msg.isStreaming && msg.content && (
                    <button
                      onClick={() => speakingId === msg.id ? stopSpeaking() : speak(msg.content, msg.id)}
                      title={speakingId === msg.id ? "Stop reading" : "Read aloud"}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors"
                      style={{
                        color: speakingId === msg.id ? "#7c3aed" : "#9ca3af",
                        background: speakingId === msg.id ? "#f3e8ff" : "transparent",
                      }}
                    >
                      {speakingId === msg.id ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="6" width="4" height="12" rx="1"/>
                            <rect x="14" y="6" width="4" height="12" rx="1"/>
                          </svg>
                          Stop
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                          </svg>
                          Read
                        </>
                      )}
                    </button>
                  )}

                  {msg.citations && msg.citations.length > 0 && (
                    <div className="space-y-1.5">
                      {msg.citations.map((c) => (
                        <button
                          key={c.index}
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent("openScripture", { detail: { bookId: c.bookId, pageNumber: c.pageNumber } }));
                            handleClose();
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors"
                          style={{ background: "#faf5ff", border: "1px solid #e9d5ff" }}
                        >
                          <span className="flex-shrink-0 w-5 h-5 rounded-full text-white text-xs font-bold flex items-center justify-center"
                            style={{ background: "#7c3aed", fontSize: "10px" }}>
                            {c.index}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate" style={{ color: "#6b21a8" }}>{c.bookTitle}</p>
                            <p className="text-xs" style={{ color: "#9333ea" }}>
                              {c.chapterNumber ? `Ch. ${c.chapterNumber} · ` : ""}
                              {c.gathaRange ? `Gatha ${c.gathaRange}` : c.gathaNumber ? `Gatha ${c.gathaNumber}` : `Page ${c.pageNumber}`}
                              {c.paraNumber ? ` · Para ${c.paraNumber}` : ""}
                            </p>
                          </div>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className={`py-3 flex-shrink-0 ${isExpanded ? "px-4 sm:px-8" : "px-4"}`}
            style={{ borderTop: "1px solid #f0f0f0", background: "#fafafa" }}>
            <div className="flex items-end gap-2">
              {/* Mic button — STT */}
              <button
                onClick={isListening ? stopListening : startListening}
                disabled={isStreaming}
                title={isListening ? "Stop listening" : "Speak your question (Hindi/English)"}
                className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                style={{
                  background: isListening
                    ? "linear-gradient(135deg, #dc2626, #ef4444)"
                    : "#f3f4f6",
                  color: isListening ? "white" : "#6b7280",
                  animation: isListening ? "pulse 1.5s infinite" : undefined,
                }}
              >
                {isListening ? (
                  // Animated mic (recording)
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
                    <path d="M19 10a7 7 0 0 1-14 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
                    <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" opacity="0.7"/>
                    <path d="M19 10a7 7 0 0 1-14 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.7"/>
                    <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
                    <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
                  </svg>
                )}
              </button>

              <textarea
                ref={inputRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? "Listening…" : "Ask a question…"}
                rows={1}
                disabled={isStreaming}
                className="flex-1 resize-none text-sm px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none disabled:opacity-60 overflow-y-auto"
                style={{ maxHeight: "120px", transition: "box-shadow 0.15s" }}
                onFocus={(e) => { e.target.style.boxShadow = "0 0 0 2px #7c3aed"; e.target.style.borderColor = "#7c3aed"; }}
                onBlur={(e) => { e.target.style.boxShadow = "none"; e.target.style.borderColor = "#e5e7eb"; }}
              />
              {isStreaming ? (
                <button onClick={handleStop}
                  className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
                  style={{ background: "#fee2e2", color: "#dc2626" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="1.5" />
                  </svg>
                </button>
              ) : (
                <button onClick={handleSend} disabled={!input.trim()}
                  className="flex-shrink-0 w-10 h-10 rounded-xl text-white flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              {isListening ? "🔴 Listening — speak now (Hindi or English)" : "Enter to send · Shift+Enter for new line"}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
