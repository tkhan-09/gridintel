"use client";

import { useEffect, useRef, useState } from "react";
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
  Database,
  ChevronDown,
  ChevronUp,
  Zap,
  FileSearch,
  MessageSquare,
  Code2,
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

// New: backend response shape
interface CopilotResponse {
  response: string;
  provider?: string;
  intent?: string;
  confidence?: number;
  entities?: Record<string, unknown>;
  sql_query?: string;
  data_rows?: Record<string, unknown>[];
  rag_used?: boolean;
  source?: "sql" | "rag" | "direct";
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolResults?: ToolResult[];
  timestamp: Date;
  isStreaming?: boolean;
  // New fields from backend
  meta?: CopilotResponse;
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

// ─── Intent display config ────────────────────────────────────────────────────

const INTENT_CONFIG: Record<
  string,
  { label: string; labelBn: string; color: string; icon: React.ReactNode }
> = {
  sql_analytics: {
    label: "SQL Analytics",
    labelBn: "ডেটা বিশ্লেষণ",
    color: "bg-violet-900/40 border-violet-600/50 text-violet-300",
    icon: <Database size={10} />,
  },
  sql_lookup: {
    label: "SQL Lookup",
    labelBn: "ডেটা অনুসন্ধান",
    color: "bg-blue-900/40 border-blue-600/50 text-blue-300",
    icon: <Database size={10} />,
  },
  api_action: {
    label: "Action",
    labelBn: "একশন",
    color: "bg-amber-900/40 border-amber-600/50 text-amber-300",
    icon: <Zap size={10} />,
  },
  ask_policy: {
    label: "Policy / Docs",
    labelBn: "নীতিমালা",
    color: "bg-teal-900/40 border-teal-600/50 text-teal-300",
    icon: <FileSearch size={10} />,
  },
  general_qa: {
    label: "General Q&A",
    labelBn: "সাধারণ প্রশ্ন",
    color: "bg-slate-700/60 border-slate-600/50 text-slate-300",
    icon: <MessageSquare size={10} />,
  },
  greeting: {
    label: "Greeting",
    labelBn: "অভিবাদন",
    color: "bg-green-900/40 border-green-600/50 text-green-300",
    icon: <MessageSquare size={10} />,
  },
  out_of_scope: {
    label: "Out of Scope",
    labelBn: "বিষয়বহির্ভূত",
    color: "bg-red-900/40 border-red-600/50 text-red-300",
    icon: <AlertTriangle size={10} />,
  },
};

const SOURCE_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  sql:    { label: "SQL",  color: "text-violet-400" },
  rag:    { label: "RAG",  color: "text-teal-400" },
  direct: { label: "AI",   color: "text-blue-400" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMarkdownTable(md: string): { columns: string[]; rows: string[][] } | null {
  const lines = md.trim().split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 3) return null;
  const columns = lines[0].split("|").slice(1, -1).map((c) => c.trim());
  const rows = lines.slice(2).map((l) =>
    l.split("|").slice(1, -1).map((c) => c.trim())
  );
  return { columns, rows };
}

function extractToolResults(content: string): { clean: string; results: ToolResult[] } {
  const results: ToolResult[] = [];
  let clean = content;

  const tableRegex = /```table\n([\s\S]*?)```/g;
  clean = clean.replace(tableRegex, (_, body) => {
    const parsed = parseMarkdownTable(body);
    if (parsed) results.push({ type: "table", ...parsed });
    return "";
  });

  const mdTableRegex = /(\|.+\|\n\|[-| :]+\|\n(?:\|.+\|\n?)+)/g;
  clean = clean.replace(mdTableRegex, (match) => {
    const parsed = parseMarkdownTable(match);
    if (parsed) results.push({ type: "table", ...parsed });
    return "";
  });

  const metricRegex = /```metric\ntitle:(.*)\nvalue:(.*)\nunit:(.*)\n```/g;
  clean = clean.replace(metricRegex, (_, title, value, unit) => {
    results.push({ type: "metric", title: title.trim(), value: value.trim(), unit: unit.trim() });
    return "";
  });

  return { clean: clean.trim(), results };
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function ToolResultTable({
  result,
  title,
}: {
  result: ToolResult;
  title?: string;
}) {
  if (!result.columns || !result.rows) return null;
  return (
    <div className="mt-3 rounded-lg border border-slate-600/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/60 border-b border-slate-600/50">
        <Table2 size={14} className="text-blue-400" />
        <span className="text-xs font-medium text-slate-300">
          {title || result.title || "ডেটা"}
        </span>
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
                    {String(cell)}
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

// SQL data_rows → table (from backend)
function SqlDataTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows || rows.length === 0) return null;
  const columns = Object.keys(rows[0]);
  return (
    <div className="mt-3 rounded-lg border border-violet-700/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-violet-900/20 border-b border-violet-700/30">
        <Database size={13} className="text-violet-400" />
        <span className="text-xs font-medium text-violet-300">
          Query Result — {rows.length} row{rows.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="overflow-x-auto max-h-64 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0">
            <tr className="bg-slate-800/80">
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2 text-left text-violet-300 font-medium whitespace-nowrap border-b border-slate-600/40"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-slate-700/30 hover:bg-violet-900/10 transition-colors"
              >
                {columns.map((col) => (
                  <td key={col} className="px-3 py-2 text-slate-300 whitespace-nowrap">
                    {row[col] === null || row[col] === undefined
                      ? <span className="text-slate-600 italic">null</span>
                      : String(row[col])}
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

// Collapsible SQL query viewer
function SqlQueryViewer({ sql }: { sql: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-400 transition-colors"
      >
        <Code2 size={11} />
        <span>Generated SQL</span>
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      {open && (
        <pre className="mt-2 p-3 bg-slate-900/80 border border-slate-700/50 rounded-lg text-xs text-green-300 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
          {sql}
        </pre>
      )}
    </div>
  );
}

// Intent + source badge row
function IntentBadge({
  intent,
  confidence,
  source,
  language,
}: {
  intent?: string;
  confidence?: number;
  source?: string;
  language: Language;
}) {
  if (!intent || intent === "greeting") return null;
  const cfg = INTENT_CONFIG[intent];
  const srcCfg = source ? SOURCE_CONFIG[source] : null;
  if (!cfg) return null;

  const confidencePct = confidence ? Math.round(confidence * 100) : null;

  return (
    <div className="flex items-center gap-2 mt-2 flex-wrap">
      <span
        className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}
      >
        {cfg.icon}
        {language === "bn" ? cfg.labelBn : cfg.label}
        {confidencePct !== null && (
          <span className="opacity-60 ml-0.5">{confidencePct}%</span>
        )}
      </span>
      {srcCfg && (
        <span className={`text-[10px] font-mono ${srcCfg.color} opacity-70`}>
          via {srcCfg.label}
        </span>
      )}
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
      {isSuccess ? (
        <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
      ) : (
        <XCircle size={14} className="mt-0.5 flex-shrink-0" />
      )}
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
      nodes.push(
        <h3 key={i} className="text-sm font-semibold text-blue-300 mt-3 mb-1">
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={i} className="text-sm font-bold text-blue-200 mt-3 mb-1">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith("**") && line.endsWith("**")) {
      nodes.push(
        <p key={i} className="text-sm font-semibold text-slate-200 my-0.5">
          {line.slice(2, -2)}
        </p>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      nodes.push(
        <li key={i} className="text-sm text-slate-300 ml-4 list-disc my-0.5">
          {line.slice(2)}
        </li>
      );
    } else if (line.trim() === "") {
      nodes.push(<div key={i} className="h-2" />);
    } else {
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

function MessageBubble({
  message,
  language,
}: {
  message: Message;
  language: Language;
}) {
  const isUser = message.role === "user";
  const { clean, results } = isUser
    ? { clean: message.content, results: [] as ToolResult[] }
    : extractToolResults(message.content);

  const meta = message.meta;
  const hasSqlData = !isUser && meta?.data_rows && meta.data_rows.length > 0;
  const hasSqlQuery = !isUser && meta?.sql_query;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} mb-5`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? "bg-blue-600" : "bg-slate-600"
        }`}
      >
        {isUser ? (
          <User size={15} className="text-white" />
        ) : (
          <Bot size={15} className="text-blue-300" />
        )}
      </div>

      {/* Bubble */}
      <div className={`max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`rounded-2xl px-4 py-3 w-full ${
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

        {/* SQL data table (from backend data_rows) */}
        {hasSqlData && (
          <div className="w-full">
            <SqlDataTable rows={meta!.data_rows!} />
          </div>
        )}

        {/* Markdown tool results (table / metric / status) */}
        {!isUser && results.length > 0 && (
          <div className="w-full mt-1">
            {results.map((r, i) => {
              if (r.type === "table") return <ToolResultTable key={i} result={r} />;
              if (r.type === "metric") return <ToolResultMetric key={i} result={r} />;
              if (r.type === "error" || r.type === "success")
                return <ToolResultStatus key={i} result={r} />;
              return null;
            })}
          </div>
        )}

        {/* SQL query viewer + intent badge */}
        {!isUser && (
          <div className="w-full px-1">
            {hasSqlQuery && <SqlQueryViewer sql={meta!.sql_query!} />}
            <IntentBadge
              intent={meta?.intent}
              confidence={meta?.confidence}
              source={meta?.source}
              language={language}
            />
          </div>
        )}

        {/* Timestamp */}
        <span className="text-xs text-slate-500 mt-1 px-1">
          {message.timestamp.toLocaleTimeString("bn-BD", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

// ─── API call ─────────────────────────────────────────────────────────────────

async function sendToBackend(
  message: string,
  history: Array<{ role: string; content: string }>
): Promise<CopilotResponse> {
  const token =
    typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("gridintel-auth") || "{}")?.state
          ?.token
      : null;

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/copilot/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message,
        session_id: "",
        conversation_history: history,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AICopilotPage() {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<Language>("bn");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Build conversation_history for backend (last 10 turns)
  const buildHistory = () =>
    messages
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

  const clearHistory = () => setMessages([]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const history = buildHistory();
      const data = await sendToBackend(text.trim(), history);

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        meta: data,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `❌ Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTemplateClick = async (query: { bn: string; en: string }) => {
    const text = language === "bn" ? query.bn : query.en;
    setInput("");
    await sendMessage(text);
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
                {[
                  { label: "NL → SQL", color: "text-violet-400 border-violet-800/50" },
                  { label: "Vector RAG", color: "text-teal-400 border-teal-800/50" },
                  { label: "Intent AI", color: "text-blue-400 border-blue-800/50" },
                ].map((tag) => (
                  <div
                    key={tag.label}
                    className={`text-xs border rounded-lg px-3 py-2 text-center ${tag.color}`}
                  >
                    {tag.label}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} language={language} />
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