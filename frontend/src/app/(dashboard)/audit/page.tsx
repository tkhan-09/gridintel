"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Shield,
  Search,
  Filter,
  Download,
  ChevronDown,
  Eye,
  X,
  Clock,
  User,
  Globe,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Trash2,
  PlusCircle,
  Lock,
  Unlock,
  LogIn,
  LogOut,
  RefreshCw,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "LOCK"
  | "UNLOCK"
  | "SUBMIT"
  | "VERIFY"
  | "APPROVE"
  | "REJECT"
  | "EXPORT"
  | "IMPORT";

type AuditModule =
  | "MOD_READING"
  | "ENERGY_BALANCE"
  | "BILLING"
  | "UTILITY_SALES"
  | "MONTH_LOCK"
  | "USER_MANAGEMENT"
  | "PLANTS"
  | "CROSS_BORDER"
  | "ADJUSTMENTS"
  | "SETTINGS"
  | "AI_COPILOT"
  | "REPORTS"
  | "AUTH";

interface AuditLogEntry {
  id: string;
  timestamp: string;
  user_id: string;
  username: string;
  user_role: string;
  office: string;
  action: AuditAction;
  module: AuditModule;
  entity_id: string | null;
  entity_label: string;
  description: string;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  ip_address: string;
  user_agent: string;
  session_id: string;
  status: "SUCCESS" | "FAILED" | "WARNING";
  duration_ms: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const USERS = [
  { id: "USR-001", name: "Engr. Md. Rafiqul Islam", role: "SuperAdmin", office: "Dhaka" },
  { id: "USR-002", name: "Engr. Nasreen Sultana", role: "DataEntry", office: "Dhaka" },
  { id: "USR-003", name: "Engr. A.K.M. Hossain", role: "Verifier", office: "Chittagong" },
  { id: "USR-004", name: "Engr. Farida Begum", role: "DataEntry", office: "Khulna" },
  { id: "USR-005", name: "Engr. Tariqul Hasan", role: "Viewer", office: "Rajshahi" },
  { id: "USR-006", name: "Engr. Salma Akter", role: "DataEntry", office: "Ashuganj" },
];

const IPS = [
  "192.168.1.101", "192.168.1.102", "10.10.5.23", "10.10.5.44",
  "172.16.0.8", "192.168.2.55", "10.0.0.12",
];

const MODULES: AuditModule[] = [
  "MOD_READING", "ENERGY_BALANCE", "BILLING", "UTILITY_SALES",
  "MONTH_LOCK", "USER_MANAGEMENT", "PLANTS", "CROSS_BORDER",
  "ADJUSTMENTS", "SETTINGS", "AUTH",
];

const ACTION_MODULE_MAP: { action: AuditAction; module: AuditModule; desc: string; hasChange: boolean }[] = [
  { action: "LOGIN", module: "AUTH", desc: "User logged in successfully", hasChange: false },
  { action: "LOGOUT", module: "AUTH", desc: "User session ended", hasChange: false },
  { action: "UPDATE", module: "MOD_READING", desc: "MOD reading updated for Ashuganj 225MW", hasChange: true },
  { action: "SUBMIT", module: "MOD_READING", desc: "MOD submission submitted for April 2026", hasChange: false },
  { action: "VERIFY", module: "MOD_READING", desc: "MOD reading verified — Payra 1320MW", hasChange: false },
  { action: "LOCK", module: "MONTH_LOCK", desc: "Month March 2026 locked by SuperAdmin", hasChange: false },
  { action: "UNLOCK", module: "MONTH_LOCK", desc: "Unlock request approved for February 2026", hasChange: false },
  { action: "UPDATE", module: "ENERGY_BALANCE", desc: "Energy balance recalculated — April 2026", hasChange: true },
  { action: "CREATE", module: "BILLING", desc: "Invoice BPDB/INV/DPDC/2026/04 created", hasChange: true },
  { action: "UPDATE", module: "BILLING", desc: "Payment status updated — DESCO invoice", hasChange: true },
  { action: "CREATE", module: "ADJUSTMENTS", desc: "Adjustment request created for Ghorashal 630MW", hasChange: true },
  { action: "APPROVE", module: "ADJUSTMENTS", desc: "Adjustment request #ADJ-2026-012 approved", hasChange: false },
  { action: "IMPORT", module: "MOD_READING", desc: "Excel import: BPDB_MOD_Apr2026.xlsx processed", hasChange: false },
  { action: "EXPORT", module: "REPORTS", desc: "Energy Balance Report exported as PDF", hasChange: false },
  { action: "UPDATE", module: "SETTINGS", desc: "Loss threshold updated: 15% → 16%", hasChange: true },
  { action: "CREATE", module: "USER_MANAGEMENT", desc: "New user account created: Engr. Kamal Hossain", hasChange: true },
  { action: "UPDATE", module: "UTILITY_SALES", desc: "BPDB utility sales data revised — March 2026", hasChange: true },
  { action: "UPDATE", module: "CROSS_BORDER", desc: "Baharampur HVC 400KV reading updated", hasChange: true },
  { action: "DELETE", module: "ADJUSTMENTS", desc: "Draft adjustment request #ADJ-2026-007 deleted", hasChange: false },
  { action: "REJECT", module: "ADJUSTMENTS", desc: "Adjustment request #ADJ-2026-015 rejected — insufficient justification", hasChange: false },
];

function randomIp() { return IPS[Math.floor(Math.random() * IPS.length)]; }
function randomUser() { return USERS[Math.floor(Math.random() * USERS.length)]; }

function generateAuditLogs(): AuditLogEntry[] {
  const logs: AuditLogEntry[] = [];
  const now = new Date("2026-04-30T18:00:00");

  for (let i = 0; i < 120; i++) {
    const ago = Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000); // up to 30 days
    const ts = new Date(now.getTime() - ago);
    const user = randomUser();
    const template = ACTION_MODULE_MAP[Math.floor(Math.random() * ACTION_MODULE_MAP.length)];
    const statusRoll = Math.random();
    const status: "SUCCESS" | "FAILED" | "WARNING" =
      statusRoll > 0.95 ? "FAILED" : statusRoll > 0.88 ? "WARNING" : "SUCCESS";

    let oldVal: Record<string, any> | null = null;
    let newVal: Record<string, any> | null = null;

    if (template.hasChange && template.action === "UPDATE") {
      if (template.module === "MOD_READING") {
        const prev = Math.floor(Math.random() * 10000 + 5000);
        const curr = prev + Math.floor(Math.random() * 2000);
        oldVal = { meter_reading: prev, net_gen_mwh: Math.floor(prev * 0.95) };
        newVal = { meter_reading: curr, net_gen_mwh: Math.floor(curr * 0.95) };
      } else if (template.module === "SETTINGS") {
        oldVal = { loss_threshold_percent: 15.0 };
        newVal = { loss_threshold_percent: 16.0 };
      } else if (template.module === "BILLING") {
        oldVal = { payment_status: "PENDING", paid_amount_bdt: 0 };
        newVal = { payment_status: "PARTIAL", paid_amount_bdt: 45000000 };
      } else if (template.module === "ENERGY_BALANCE") {
        oldVal = { system_loss_percent: 15.8, net_gen_mwh: 4100000 };
        newVal = { system_loss_percent: 15.52, net_gen_mwh: 4218650 };
      } else {
        oldVal = { value: "old_value" };
        newVal = { value: "new_value" };
      }
    } else if (template.action === "CREATE" && template.hasChange) {
      newVal = { created: true, entity: template.entity_label ?? template.module };
    }

    logs.push({
      id: `AUD-${String(i + 1).padStart(5, "0")}`,
      timestamp: ts.toISOString(),
      user_id: user.id,
      username: user.name,
      user_role: user.role,
      office: user.office,
      action: template.action,
      module: template.module,
      entity_id: template.hasChange ? `ENT-${Math.floor(Math.random() * 9000 + 1000)}` : null,
      entity_label: template.module.replace(/_/g, " "),
      description: template.desc,
      old_value: oldVal,
      new_value: newVal,
      ip_address: randomIp(),
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0",
      session_id: `SES-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
      status,
      duration_ms: Math.floor(Math.random() * 800 + 20),
    });
  }

  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return logs;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTION_STYLES: Record<AuditAction, { bg: string; text: string; icon: React.ReactNode }> = {
  CREATE: { bg: "bg-emerald-500/10", text: "text-emerald-400", icon: <PlusCircle className="w-3 h-3" /> },
  UPDATE: { bg: "bg-blue-500/10", text: "text-blue-400", icon: <Edit3 className="w-3 h-3" /> },
  DELETE: { bg: "bg-rose-500/10", text: "text-rose-400", icon: <Trash2 className="w-3 h-3" /> },
  LOGIN: { bg: "bg-slate-500/10", text: "text-slate-400", icon: <LogIn className="w-3 h-3" /> },
  LOGOUT: { bg: "bg-slate-500/10", text: "text-slate-400", icon: <LogOut className="w-3 h-3" /> },
  LOCK: { bg: "bg-purple-500/10", text: "text-purple-400", icon: <Lock className="w-3 h-3" /> },
  UNLOCK: { bg: "bg-amber-500/10", text: "text-amber-400", icon: <Unlock className="w-3 h-3" /> },
  SUBMIT: { bg: "bg-cyan-500/10", text: "text-cyan-400", icon: <CheckCircle2 className="w-3 h-3" /> },
  VERIFY: { bg: "bg-teal-500/10", text: "text-teal-400", icon: <CheckCircle2 className="w-3 h-3" /> },
  APPROVE: { bg: "bg-emerald-500/10", text: "text-emerald-400", icon: <CheckCircle2 className="w-3 h-3" /> },
  REJECT: { bg: "bg-rose-500/10", text: "text-rose-400", icon: <X className="w-3 h-3" /> },
  EXPORT: { bg: "bg-indigo-500/10", text: "text-indigo-400", icon: <Download className="w-3 h-3" /> },
  IMPORT: { bg: "bg-violet-500/10", text: "text-violet-400", icon: <Activity className="w-3 h-3" /> },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  SUCCESS: { bg: "bg-emerald-500/10", text: "text-emerald-400", icon: <CheckCircle2 className="w-3 h-3" /> },
  FAILED: { bg: "bg-rose-500/10", text: "text-rose-400", icon: <AlertTriangle className="w-3 h-3" /> },
  WARNING: { bg: "bg-amber-500/10", text: "text-amber-400", icon: <AlertTriangle className="w-3 h-3" /> },
};

function ActionBadge({ action }: { action: AuditAction }) {
  const s = ACTION_STYLES[action];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
      {s.icon}
      {action}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.SUCCESS;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
      {s.icon}
      {status}
    </span>
  );
}

function fmtTs(ts: string): { date: string; time: string } {
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ log, onClose }: { log: AuditLogEntry; onClose: () => void }) {
  const { date, time } = fmtTs(log.timestamp);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#0f172a] border border-[#334155] rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1e293b]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Shield className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Audit Log Detail</h2>
              <p className="text-xs text-slate-500">{log.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-[#1e293b] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Timestamp", value: `${date} ${time}`, icon: <Clock className="w-3.5 h-3.5" /> },
              { label: "User", value: log.username, icon: <User className="w-3.5 h-3.5" /> },
              { label: "Role", value: log.user_role, icon: <Shield className="w-3.5 h-3.5" /> },
              { label: "Office", value: log.office, icon: <Activity className="w-3.5 h-3.5" /> },
              { label: "IP Address", value: log.ip_address, icon: <Globe className="w-3.5 h-3.5" /> },
              { label: "Session", value: log.session_id, icon: <Lock className="w-3.5 h-3.5" /> },
              { label: "Duration", value: `${log.duration_ms}ms`, icon: <Clock className="w-3.5 h-3.5" /> },
              { label: "Entity ID", value: log.entity_id ?? "—", icon: <Activity className="w-3.5 h-3.5" /> },
            ].map((item) => (
              <div key={item.label} className="bg-[#1e293b] rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                  {item.icon}
                  <span className="text-xs uppercase tracking-wider">{item.label}</span>
                </div>
                <p className="text-sm text-slate-200 font-mono">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Action + Status */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-[#1e293b] rounded-lg p-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Action</p>
              <ActionBadge action={log.action} />
            </div>
            <div className="flex-1 bg-[#1e293b] rounded-lg p-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Module</p>
              <span className="text-sm text-slate-200 font-mono">{log.module}</span>
            </div>
            <div className="flex-1 bg-[#1e293b] rounded-lg p-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Status</p>
              <StatusBadge status={log.status} />
            </div>
          </div>

          {/* Description */}
          <div className="bg-[#1e293b] rounded-lg p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Description</p>
            <p className="text-sm text-slate-200">{log.description}</p>
          </div>

          {/* Value diff */}
          {(log.old_value || log.new_value) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#1e293b] rounded-lg p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-400" />
                  Old Values
                </p>
                {log.old_value ? (
                  <pre className="text-xs text-rose-300 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(log.old_value, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-slate-500 italic">No previous value</p>
                )}
              </div>
              <div className="bg-[#1e293b] rounded-lg p-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  New Values
                </p>
                {log.new_value ? (
                  <pre className="text-xs text-emerald-300 font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(log.new_value, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-slate-500 italic">No new value</p>
                )}
              </div>
            </div>
          )}

          {/* User Agent */}
          <div className="bg-[#1e293b] rounded-lg p-3">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">User Agent</p>
            <p className="text-xs text-slate-400 font-mono break-all">{log.user_agent}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function AuditPage() {
  const [logs] = useState<AuditLogEntry[]>(() => generateAuditLogs());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterUser, setFilterUser] = useState("ALL");
  const [filterAction, setFilterAction] = useState("ALL");
  const [filterModule, setFilterModule] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const filtered = useMemo(() => {
    let rows = [...logs];
    if (searchQuery)
      rows = rows.filter(
        (r) =>
          r.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.ip_address.includes(searchQuery) ||
          r.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    if (filterUser !== "ALL") rows = rows.filter((r) => r.username === filterUser);
    if (filterAction !== "ALL") rows = rows.filter((r) => r.action === filterAction);
    if (filterModule !== "ALL") rows = rows.filter((r) => r.module === filterModule);
    if (filterStatus !== "ALL") rows = rows.filter((r) => r.status === filterStatus);
    if (filterDateFrom) rows = rows.filter((r) => new Date(r.timestamp) >= new Date(filterDateFrom));
    if (filterDateTo) rows = rows.filter((r) => new Date(r.timestamp) <= new Date(filterDateTo + "T23:59:59"));
    return rows;
  }, [logs, searchQuery, filterUser, filterAction, filterModule, filterStatus, filterDateFrom, filterDateTo]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [filtered.length]);

  const uniqueUsers = [...new Set(logs.map((l) => l.username))].sort();
  const uniqueActions: AuditAction[] = [...new Set(logs.map((l) => l.action))].sort() as AuditAction[];

  // Stats
  const successCount = logs.filter((l) => l.status === "SUCCESS").length;
  const failedCount = logs.filter((l) => l.status === "FAILED").length;
  const warningCount = logs.filter((l) => l.status === "WARNING").length;

  return (
    <div className="min-h-screen bg-[#080f1e] text-slate-100 p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-blue-400" />
            <h1 className="text-2xl font-bold text-slate-100">System Audit Log</h1>
            <span className="px-2 py-0.5 rounded text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
              Admin Only
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Complete audit trail — user actions, data changes, IP tracking, timestamps
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1e293b] border border-[#334155] text-slate-300 text-sm hover:bg-[#334155] transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Events", value: logs.length.toString(), color: "#3b82f6", icon: <Activity className="w-4 h-4" /> },
          { label: "Successful", value: successCount.toString(), color: "#10b981", icon: <CheckCircle2 className="w-4 h-4" /> },
          { label: "Failed", value: failedCount.toString(), color: "#ef4444", icon: <AlertTriangle className="w-4 h-4" /> },
          { label: "Warnings", value: warningCount.toString(), color: "#f59e0b", icon: <AlertTriangle className="w-4 h-4" /> },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-[#0f172a] border border-[#1e293b] p-4 flex items-center gap-4">
            <div className="p-2.5 rounded-lg" style={{ background: `${stat.color}20`, border: `1px solid ${stat.color}40` }}>
              <div style={{ color: stat.color }}>{stat.icon}</div>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider">{stat.label}</p>
              <p className="text-2xl font-bold font-mono" style={{ color: stat.color }}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[#0f172a] border border-[#1e293b] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-300">Filters</span>
          <button
            onClick={() => {
              setSearchQuery(""); setFilterUser("ALL"); setFilterAction("ALL");
              setFilterModule("ALL"); setFilterStatus("ALL");
              setFilterDateFrom(""); setFilterDateTo("");
            }}
            className="ml-auto text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Clear All
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex items-center gap-2 bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-500 shrink-0" />
            <input
              type="text"
              placeholder="Search user, description, IP, log ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm text-slate-200 placeholder:text-slate-500 outline-none w-full"
            />
          </div>

          {/* Selects */}
          {[
            {
              value: filterUser, setter: setFilterUser,
              options: ["ALL", ...uniqueUsers],
              labels: { ALL: "All Users" },
            },
            {
              value: filterAction, setter: setFilterAction,
              options: ["ALL", ...uniqueActions],
              labels: { ALL: "All Actions" },
            },
            {
              value: filterModule, setter: setFilterModule,
              options: ["ALL", ...MODULES],
              labels: { ALL: "All Modules" },
            },
            {
              value: filterStatus, setter: setFilterStatus,
              options: ["ALL", "SUCCESS", "FAILED", "WARNING"],
              labels: { ALL: "All Statuses" },
            },
          ].map((f, i) => (
            <div key={i} className="relative">
              <select
                value={f.value}
                onChange={(e) => f.setter(e.target.value)}
                className="appearance-none bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 text-sm text-slate-300 outline-none pr-8 cursor-pointer hover:border-[#475569] transition-colors"
              >
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {(f.labels as any)[o] ?? o}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
            </div>
          ))}

          {/* Date range */}
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 text-sm text-slate-300 outline-none hover:border-[#475569] transition-colors"
          />
          <span className="self-center text-slate-600 text-sm">to</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 text-sm text-slate-300 outline-none hover:border-[#475569] transition-colors"
          />
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[#0f172a] border border-[#1e293b] p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-400">
            Showing <span className="text-slate-200 font-semibold">{paginated.length}</span> of{" "}
            <span className="text-slate-200 font-semibold">{filtered.length}</span> records
          </p>
          <p className="text-xs text-slate-600 font-mono">Page {page} of {totalPages}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1000px]">
            <thead>
              <tr className="border-b border-[#1e293b]">
                {[
                  "Log ID", "Timestamp", "User", "Role", "Office",
                  "Action", "Module", "Description", "IP Address", "Status", "Duration", ""
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left text-slate-500 font-medium pb-3 pr-4 uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e293b]">
              {paginated.map((log) => {
                const { date, time } = fmtTs(log.timestamp);
                return (
                  <tr
                    key={log.id}
                    className={`hover:bg-[#1e293b] transition-colors ${
                      log.status === "FAILED" ? "bg-rose-500/5" :
                      log.status === "WARNING" ? "bg-amber-500/5" : ""
                    }`}
                  >
                    <td className="py-3 pr-4 text-blue-400 font-mono">{log.id}</td>
                    <td className="py-3 pr-4">
                      <div className="text-slate-300 font-mono">{date}</div>
                      <div className="text-slate-500 font-mono">{time}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#334155] flex items-center justify-center text-xs font-bold text-slate-300">
                          {log.username.split(" ").pop()?.[0] ?? "U"}
                        </div>
                        <span className="text-slate-200 max-w-[120px] truncate">{log.username}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        log.user_role === "SuperAdmin"
                          ? "bg-purple-500/10 text-purple-400"
                          : log.user_role === "Verifier"
                          ? "bg-blue-500/10 text-blue-400"
                          : log.user_role === "DataEntry"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-slate-500/10 text-slate-400"
                      }`}>
                        {log.user_role}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-400">{log.office}</td>
                    <td className="py-3 pr-4">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-slate-400 font-mono text-xs">
                        {log.module.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-3 pr-4 max-w-[220px]">
                      <p className="text-slate-300 truncate" title={log.description}>
                        {log.description}
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="font-mono text-slate-400 flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {log.ip_address}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="py-3 pr-4 text-slate-500 font-mono">{log.duration_ms}ms</td>
                    <td className="py-3 pr-4">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-1.5 rounded text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                        title="View details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#1e293b]">
          <p className="text-xs text-slate-500">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} entries
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg bg-[#1e293b] border border-[#334155] text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
              return (
                <button
                  key={pg}
                  onClick={() => setPage(pg)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                    pg === page
                      ? "bg-blue-600 text-white"
                      : "bg-[#1e293b] border border-[#334155] text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {pg}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg bg-[#1e293b] border border-[#334155] text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Detail Modal ────────────────────────────────────────────────────── */}
      {selectedLog && (
        <DetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}
