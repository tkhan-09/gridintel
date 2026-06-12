"use client";

import { useEffect, useRef, useState } from "react";
import { useCopilotStore } from "@/store/copilotStore";
import { useAuthStore } from "@/store/authStore";
import {
  Bot,
  User,
  Send,
  Trash2,
  Languages,
  ChevronRight,
  Loader2,
  BarChart2,
  Table2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Language = "bn" | "en";

interface ToolResult {
  type: "table" | "metric" | "chart_ref" | "error" | "success";
  title?: string;
  columns?: string[];
  rows?: (string | number)[][];
  value?: string | number;
  unit?: string;
  message?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolResults?: ToolResult[];
  timestamp: Date;
  isStreaming?: boolean;
}

// ─── Bengali Suggested Query Templates ───────────────────────────────────────

const SUGGESTED_QUERIES: { bn: string; en: string; category: string }[] = [
  {
    category: "System Loss",
    bn: "গত মাসের সর্বোচ্চ সিস্টেম লস কোন অফিসে?",
    en: "Which office had the highest system loss last month?",
  },
  {
    category: "Forecast",
    bn: "পাওয়ার প্ল্যান্ট উৎপাদনের ফোরকাস্ট চার্ট দেখাও",
    en: "Show power plant generation forecast chart",
  },
  {
    category: "Adjustments",
    bn: "চলতি মাসের আনঅপ্রুভড অ্যাডজাস্টমেন্ট লগ দেখাও",
    en: "Show unapproved adjustment log for current month",
  },
  {
    category: "Generation",
    bn: "আশুগঞ্জ পাওয়ার প্ল্যান্টের গত ৬ মাসের নেট উৎপাদন কত?",
    en: "Net generation of Ashuganj power plant for last 6 months?",
  },
  {
    category: "Billing",
    bn: "DPDC-র বকেয়া বিল কত টাকা এবং কতদিন ধরে বকেয়া?",
    en: "How much is DPDC's outstanding bill and for how long?",
  },
  {
    category: "Cross Border",
    bn: "ভারত থেকে এপ্রিল ২০২৬-এ কত MU আমদানি হয়েছে?",
    en: "How many MU were imported from India in April 2026?",
  },
  {
    category: "MOD",
    bn: "কোন প্ল্যান্টের MOD সাবমিশন এখনও পেন্ডিং আছে?",
    en: "Which plants have MOD submission still pending?",
  },
  {
    category: "Auxiliary",
    bn: "কোন প্ল্যান্টে অক্সিলিয়ারি কনজাম্পশন সবচেয়ে বেশি?",
    en: "Which plant has the highest auxiliary consumption?",
  },
  {
    category: "Energy Balance",
    bn: "মার্চ ২০২৬-এর এনার্জি ব্যালেন্স সামারি দেখাও",
    en: "Show energy balance summary for March 2026",
  },
  {
    category: "Anomalies",
    bn: "এই মাসে কোন কোন অ্যানোমালি অ্যালার্ট সক্রিয় আছে?",
    en: "Which anomaly alerts are active this month?",
  },
  {
    category: "Plants",
    bn: "পায়রা ১৩২০MW প্ল্যান্টের OMF ইতিহাস দেখাও",
    en: "Show OMF history of Payra 1320MW plant",
  },
  {
    category: "Revenue",
    bn: "চলতি অর্থবছরে মোট রাজস্ব কত?",
    en: "What is the total revenue in the current fiscal year?",
  },
  {
    category: "Submission",
    bn: "গত তিন মাসে কোন অফিস সময়মতো সাবমিট করেনি?",
    en: "Which offices failed to submit on time in the last 3 months?",
  },
  {
    category: "Fuel",
    bn: "জ্বালানি প্রকারভেদে উৎপাদনের তুলনামূলক চিত্র দেখাও",
    en: "Show comparative chart of generation by fuel type",
  },
  {
    category: "CCPP",
    bn: "হরিপুর CCPP-এর GT/ST রেশিও বিশ্লেষণ করো",
    en: "Analyze GT/ST ratio of Haripur CCPP",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMarkdownTable(md: string): { columns: string[]; rows: string[][] } | null {
  const lines = md.trim().split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 3) return null;
  const columns = lines[0]
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
  const rows = lines.slice(2).map((l) =>
    l
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim())
  );
  return { columns, rows };
}

function extractToolResults(content: string): { clean: string; results: ToolResult[] } {
  const results: ToolResult[] = [];
  let clean = content;

  // Extract ```table blocks
  const tableRegex = /```table\n([\s\S]*?)```/g;
  clean = clean.replace(tableRegex, (_, body) => {
    const parsed = parseMarkdownTable(body);
    if (parsed) results.push({ type: "table", ...parsed });
    return "";
  });

  // Extract markdown tables inline
  const mdTableRegex = /(\|.+\|\n\|[-| :]+\|\n(?:\|.+\|\n?)+)/g;
  clean = clean.replace(mdTableRegex, (match) => {
    const parsed = parseMarkdownTable(match);
    if (parsed) results.push({ type: "table", ...parsed });
    return "";
  });

  // Extract ```metric blocks
  const metricRegex = /```metric\ntitle:(.*)\nvalue:(.*)\nunit:(.*)\n```/g;
  clean = clean.replace(metricRegex, (_, title, value, unit) => {
    results.push({ type: "metric", title: title.trim(), value: value.trim(), unit: unit.trim() });
    return "";
  });

  return { clean: clean.trim(), results };
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function ToolResultTable({ result }: { result: ToolResult }) {
  if (!result.columns || !result.rows) return null;
  return (
    <div className="mt-3 rounded-lg border border-slate-600/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/60 border-b border-slate-600/50">
        <Table2 size={14} className="text-blue-400" />
        {result.title && <span className="text-xs font-medium text-slate-300">{result.title}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-800/60">
              {result.columns.map((col, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left text-slate-400 font-medium whitespace-nowrap border-b border-slate-600/40"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows?.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-slate-700/40 hover:bg-slate-700/20 transition-colors"
              >
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 text-slate-300 whitespace-nowrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ToolResultMetric({ result }: { result: ToolResult }) {
  return (
    <div className="mt-3 inline-flex items-center gap-3 bg-blue-900/30 border border-blue-700/40 rounded-lg px-4 py-3">
      <BarChart2 size={18} className="text-blue-400 flex-shrink-0" />
      <div>
        {result.title && <div className="text-xs text-slate-400 mb-0.5">{result.title}</div>}
        <div className="text-lg font-bold text-white">
          {result.value}
          {result.unit && <span className="text-sm text-slate-400 ml-1">{result.unit}</span>}
        </div>
      </div>
    </div>
  );
}

function ToolResultStatus({ result }: { result: ToolResult }) {
  const isSuccess = result.type === "success";
  return (
    <div
      className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs border ${
        isSuccess
          ? "bg-green-900/20 border-green-700/40 text-green-300"
          : "bg-red-900/20 border-red-700/40 text-red-300"
      }`}
    >
      {isSuccess ? <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" /> : <XCircle size={14} className="mt-0.5 flex-shrink-0" />}
      <span>{result.message}</span>
    </div>
  );
}

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      nodes.push(<h3 key={i} className="text-sm font-semibold text-blue-300 mt-3 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      nodes.push(<h2 key={i} className="text-sm font-bold text-blue-200 mt-3 mb-1">{line.slice(3)}</h2>);
    } else if (line.startsWith("**") && line.endsWith("**")) {
      nodes.push(<p key={i} className="text-sm font-semibold text-slate-200 my-0.5">{line.slice(2, -2)}</p>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      nodes.push(
        <li key={i} className="text-sm text-slate-300 ml-4 list-disc my-0.5">
          {line.slice(2)}
        </li>
      );
    } else if (line.trim() === "") {
      nodes.push(<div key={i} className="h-2" />);
    } else {
      // inline bold
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      nodes.push(
        <p key={i} className="text-sm text-slate-300 leading-relaxed">
          {parts.map((part, pi) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={pi} className="text-slate-100 font-semibold">
                {part.slice(2, -2)}
              </strong>
            ) : (
              part
            )
          )}
        </p>
      );
    }
    i++;
  }
  return nodes;
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const { clean, results } = isUser
    ? { clean: message.content, results: [] as ToolResult[] }
    : extractToolResults(message.content);

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} mb-5`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? "bg-blue-600" : "bg-slate-600"
        }`}
      >
        {isUser ? <User size={15} className="text-white" /> : <Bot size={15} className="text-blue-300" />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-blue-700 text-white rounded-tr-sm"
              : "bg-slate-700/70 border border-slate-600/40 rounded-tl-sm"
          }`}
        >
          {message.isStreaming ? (
            <div className="flex items-center gap-1.5 py-1">
              <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
              <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
              <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
            </div>
          ) : isUser ? (
            <p className="text-sm leading-relaxed">{message.content}</p>
          ) : (
            <div>{renderMarkdown(clean)}</div>
          )}
        </div>

        {/* Tool Results */}
        {!isUser && results.length > 0 && (
          <div className="w-full mt-1">
            {results.map((r, i) => {
              if (r.type === "table") return <ToolResultTable key={i} result={r} />;
              if (r.type === "metric") return <ToolResultMetric key={i} result={r} />;
              if (r.type === "error" || r.type === "success") return <ToolResultStatus key={i} result={r} />;
              return null;
            })}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-xs text-slate-500 mt-1 px-1">
          {message.timestamp.toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AICopilotPage() {
  const { messages, isLoading, send, clearHistory } = useCopilotStore();
  const { user } = useAuthStore();
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<Language>("bn");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await send(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTemplateClick = async (query: { bn: string; en: string }) => {
    const text = language === "bn" ? query.bn : query.en;
    setInput(text);
    inputRef.current?.focus();
    // Auto-send
    await send(text);
    setInput("");
  };

  const categories = Array.from(new Set(SUGGESTED_QUERIES.map((q) => q.category)));
  const filteredQueries = selectedCategory
    ? SUGGESTED_QUERIES.filter((q) => q.category === selectedCategory)
    : SUGGESTED_QUERIES;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#0D1B2A] overflow-hidden">
      {/* ── Left Template Panel ───────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 flex flex-col border-r border-slate-700/50 bg-[#0A1520]">
        {/* Header */}
        <div className="px-4 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2 mb-3">
            <Bot size={18} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-100">পরামর্শকৃত প্রশ্ন</h2>
            <span className="ml-auto text-xs text-slate-500">Suggested</span>
          </div>
          {/* Category pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                selectedCategory === null
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-300"
              }`}
            >
              সব
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  selectedCategory === cat
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-300"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Query list */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {filteredQueries.map((query, i) => (
            <button
              key={i}
              onClick={() => handleTemplateClick(query)}
              disabled={isLoading}
              className="w-full text-left group flex items-start gap-2 px-3 py-2.5 rounded-lg hover:bg-slate-700/50 border border-transparent hover:border-slate-600/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight
                size={12}
                className="text-blue-500 flex-shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform"
              />
              <div>
                <p className="text-xs text-slate-300 leading-snug">
                  {language === "bn" ? query.bn : query.en}
                </p>
                {language === "bn" && (
                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">{query.en}</p>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Language toggle */}
        <div className="px-4 py-3 border-t border-slate-700/50">
          <div className="flex items-center gap-2">
            <Languages size={14} className="text-slate-400" />
            <span className="text-xs text-slate-400">ভাষা / Language</span>
            <div className="ml-auto flex rounded-lg overflow-hidden border border-slate-600">
              <button
                onClick={() => setLanguage("bn")}
                className={`px-2.5 py-1 text-xs transition-colors ${
                  language === "bn" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                বাংলা
              </button>
              <button
                onClick={() => setLanguage("en")}
                className={`px-2.5 py-1 text-xs transition-colors ${
                  language === "en" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Chat Panel ───────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-700/50 bg-[#0D1B2A]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
              <Bot size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-100">GridIntel AI Copilot</h1>
              <p className="text-xs text-slate-500">
                BPDB পাওয়ার ইন্টেলিজেন্স সহকারী · NLToSQL + RAG
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-slate-400">Groq LLaMA-3.3 · Online</span>
            </div>
            <button
              onClick={clearHistory}
              title="Clear chat history"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-red-400 hover:bg-red-900/20 border border-transparent hover:border-red-800/40 transition-all"
            >
              <Trash2 size={12} />
              Clear
            </button>
          </div>
        </div>

        {/* Chat messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center mb-5 shadow-lg shadow-blue-900/40">
                <Bot size={30} className="text-white" />
              </div>
              <h2 className="text-lg font-semibold text-slate-200 mb-2">
                GridIntel AI Copilot
              </h2>
              <p className="text-sm text-slate-400 max-w-md leading-relaxed mb-1">
                BPDB-র পাওয়ার সেক্টর ডেটা নিয়ে যেকোনো প্রশ্ন করুন বাংলা বা ইংরেজিতে।
              </p>
              <p className="text-xs text-slate-600 max-w-md">
                Ask questions about generation, MOD data, billing, energy balance, anomalies and more.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-3 max-w-lg">
                {["NL → SQL", "Vector RAG", "AI Tools"].map((tag) => (
                  <div
                    key={tag}
                    className="text-xs text-slate-500 border border-slate-700 rounded-lg px-3 py-2 text-center"
                  >
                    {tag}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {isLoading && (
                <div className="flex gap-3 mb-5">
                  <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
                    <Bot size={15} className="text-blue-300" />
                  </div>
                  <div className="bg-slate-700/70 border border-slate-600/40 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Loader2 size={12} className="text-blue-400 animate-spin" />
                      <span className="text-xs text-slate-400">বিশ্লেষণ করছি...</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div className="px-6 py-4 border-t border-slate-700/50 bg-[#0D1B2A]">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  language === "bn"
                    ? "বাংলা বা ইংরেজিতে প্রশ্ন করুন… (Enter পাঠান, Shift+Enter নতুন লাইন)"
                    : "Ask in Bengali or English… (Enter to send, Shift+Enter for newline)"
                }
                rows={1}
                className="w-full bg-slate-800/60 border border-slate-600/50 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/30 transition-all max-h-32 overflow-y-auto"
                style={{ minHeight: "46px" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 128) + "px";
                }}
                disabled={isLoading}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="flex-shrink-0 w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white flex items-center justify-center transition-all shadow-lg shadow-blue-900/30 disabled:shadow-none"
            >
              {isLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-2 text-center">
            GridIntel AI · Powered by Groq LLaMA-3.3-70B · Free Tier
          </p>
        </div>
      </main>
    </div>
  );
}
