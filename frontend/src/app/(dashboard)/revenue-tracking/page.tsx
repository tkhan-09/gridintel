"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Search,
  ChevronDown,
  ArrowUpDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentStatus = "PAID" | "PARTIAL" | "OVERDUE" | "PENDING";

interface InvoiceRecord {
  id: string;
  invoice_number: string;
  utility: string;
  billing_month: string;
  billing_year: number;
  sales_mwh: number;
  tariff_per_kwh: number;
  gross_amount_bdt: number;
  vat_amount_bdt: number;
  total_amount_bdt: number;
  paid_amount_bdt: number;
  outstanding_bdt: number;
  payment_status: PaymentStatus;
  invoice_date: string;
  due_date: string;
  last_payment_date: string | null;
  collection_rate: number;
}

interface UtilityRevenueSummary {
  utility: string;
  total_billed_bdt: number;
  total_collected_bdt: number;
  outstanding_bdt: number;
  collection_rate: number;
  invoices_count: number;
  overdue_count: number;
  avg_tariff_per_kwh: number;
}

interface MonthlyRevenueTrend {
  month: string;
  billed: number;
  collected: number;
  outstanding: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const UTILITIES = ["BPDB", "DPDC", "DESCO", "PBS", "NESCO", "WZPDCL"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const UTILITY_TARIFFS: Record<string, number> = {
  BPDB: 6.99, DPDC: 7.01, DESCO: 7.02, PBS: 6.98, NESCO: 6.98, WZPDCL: 6.96,
};

function generateInvoices(): InvoiceRecord[] {
  const records: InvoiceRecord[] = [];
  const statuses: PaymentStatus[] = ["PAID", "PAID", "PAID", "PARTIAL", "OVERDUE", "PENDING"];
  let idx = 0;

  for (let m = 1; m <= 4; m++) {
    for (const utility of UTILITIES) {
      const salesMwh = Math.floor(Math.random() * 300000 + 150000);
      const tariff = UTILITY_TARIFFS[utility];
      const gross = salesMwh * tariff * 1000; // MWh → kWh × tariff
      const vat = gross * 0.15;
      const total = gross + vat;
      const status = statuses[idx % statuses.length];
      idx++;
      const paidPct =
        status === "PAID" ? 1 : status === "PARTIAL" ? Math.random() * 0.5 + 0.3 : status === "OVERDUE" ? 0 : 0;
      const paid = total * paidPct;
      const monthName = MONTHS[m - 1];
      const invoiceDate = `2026-0${m}-05`;
      const dueDate = `2026-0${m}-25`;

      records.push({
        id: `INV-2026-${m.toString().padStart(2, "0")}-${utility}`,
        invoice_number: `BPDB/INV/${utility}/2026/${m.toString().padStart(2, "0")}`,
        utility,
        billing_month: monthName,
        billing_year: 2026,
        sales_mwh: salesMwh,
        tariff_per_kwh: tariff,
        gross_amount_bdt: gross,
        vat_amount_bdt: vat,
        total_amount_bdt: total,
        paid_amount_bdt: paid,
        outstanding_bdt: total - paid,
        payment_status: status,
        invoice_date: invoiceDate,
        due_date: dueDate,
        last_payment_date: paid > 0 ? `2026-0${m}-20` : null,
        collection_rate: paidPct * 100,
      });
    }
  }
  return records;
}

function buildUtilitySummaries(invoices: InvoiceRecord[]): UtilityRevenueSummary[] {
  return UTILITIES.map((u) => {
    const rows = invoices.filter((i) => i.utility === u);
    const billed = rows.reduce((s, r) => s + r.total_amount_bdt, 0);
    const collected = rows.reduce((s, r) => s + r.paid_amount_bdt, 0);
    const outstanding = billed - collected;
    return {
      utility: u,
      total_billed_bdt: billed,
      total_collected_bdt: collected,
      outstanding_bdt: outstanding,
      collection_rate: billed > 0 ? (collected / billed) * 100 : 0,
      invoices_count: rows.length,
      overdue_count: rows.filter((r) => r.payment_status === "OVERDUE").length,
      avg_tariff_per_kwh: UTILITY_TARIFFS[u],
    };
  });
}

function buildMonthlyTrend(invoices: InvoiceRecord[]): MonthlyRevenueTrend[] {
  const months = ["Jan-26", "Feb-26", "Mar-26", "Apr-26"];
  return months.map((label, i) => {
    const rows = invoices.filter((_, j) => Math.floor(j / UTILITIES.length) === i);
    const billed = rows.reduce((s, r) => s + r.total_amount_bdt, 0) / 1_000_000;
    const collected = rows.reduce((s, r) => s + r.paid_amount_bdt, 0) / 1_000_000;
    return { month: label, billed, collected, outstanding: billed - collected };
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBDT(v: number): string {
  if (v >= 1_000_000_000) return `৳${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `৳${(v / 1_000_000).toFixed(1)}M`;
  return `৳${(v / 1_000).toFixed(0)}K`;
}

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

const STATUS_CONFIG: Record<PaymentStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  PAID: { label: "Paid", bg: "bg-emerald-500/10", text: "text-emerald-400", icon: <CheckCircle2 className="w-3 h-3" /> },
  PARTIAL: { label: "Partial", bg: "bg-amber-500/10", text: "text-amber-400", icon: <Clock className="w-3 h-3" /> },
  OVERDUE: { label: "Overdue", bg: "bg-rose-500/10", text: "text-rose-400", icon: <AlertCircle className="w-3 h-3" /> },
  PENDING: { label: "Pending", bg: "bg-slate-500/10", text: "text-slate-400", icon: <Clock className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: PaymentStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f172a] border border-[#334155] rounded-lg p-3 shadow-xl text-xs">
      <p className="text-slate-300 font-semibold mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="text-slate-100 font-mono">৳{p.value.toFixed(1)}M</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type SortKey = keyof InvoiceRecord;

export default function RevenueTrackingPage() {
  const [invoices] = useState<InvoiceRecord[]>(() => generateInvoices());
  const [summaries] = useState<UtilityRevenueSummary[]>(() =>
    buildUtilitySummaries(generateInvoices())
  );
  const [trendData] = useState<MonthlyRevenueTrend[]>(() =>
    buildMonthlyTrend(generateInvoices())
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [filterUtility, setFilterUtility] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | PaymentStatus>("ALL");
  const [filterMonth, setFilterMonth] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("billing_month");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [activeTab, setActiveTab] = useState<"table" | "summary" | "trends">("table");

  const filtered = useMemo(() => {
    let rows = [...invoices];
    if (searchQuery)
      rows = rows.filter(
        (r) =>
          r.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.utility.toLowerCase().includes(searchQuery.toLowerCase())
      );
    if (filterUtility !== "ALL") rows = rows.filter((r) => r.utility === filterUtility);
    if (filterStatus !== "ALL") rows = rows.filter((r) => r.payment_status === filterStatus);
    if (filterMonth !== "ALL") rows = rows.filter((r) => r.billing_month === filterMonth);
    rows.sort((a, b) => {
      const aVal = a[sortKey] as any;
      const bVal = b[sortKey] as any;
      const cmp = typeof aVal === "number" ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [invoices, searchQuery, filterUtility, filterStatus, filterMonth, sortKey, sortDir]);

  const totalBilled = filtered.reduce((s, r) => s + r.total_amount_bdt, 0);
  const totalCollected = filtered.reduce((s, r) => s + r.paid_amount_bdt, 0);
  const totalOutstanding = totalBilled - totalCollected;
  const overallCollectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortTh({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col;
    return (
      <th
        className="text-left text-slate-500 font-medium pb-3 pr-4 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors select-none"
        onClick={() => handleSort(col)}
      >
        <span className="flex items-center gap-1">
          {label}
          <ArrowUpDown className={`w-3 h-3 ${active ? "text-blue-400" : ""}`} />
        </span>
      </th>
    );
  }

  return (
    <div className="min-h-screen bg-[#080f1e] text-slate-100 p-6 space-y-6">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Revenue Tracking</h1>
          <p className="text-sm text-slate-500 mt-1">
            Bulk supply invoicing, tariff tracking & payment collection — FY 2025-26
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
          <Download className="w-4 h-4" />
          Export Report
        </button>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Billed",
            value: fmtBDT(invoices.reduce((s, r) => s + r.total_amount_bdt, 0)),
            icon: <DollarSign className="w-4 h-4" />,
            accent: "#3b82f6",
            sub: `${invoices.length} invoices`,
          },
          {
            label: "Total Collected",
            value: fmtBDT(invoices.reduce((s, r) => s + r.paid_amount_bdt, 0)),
            icon: <CheckCircle2 className="w-4 h-4" />,
            accent: "#10b981",
            sub: `${fmtPct((invoices.reduce((s, r) => s + r.paid_amount_bdt, 0) / invoices.reduce((s, r) => s + r.total_amount_bdt, 0)) * 100)} collection rate`,
          },
          {
            label: "Outstanding",
            value: fmtBDT(invoices.reduce((s, r) => s + r.outstanding_bdt, 0)),
            icon: <AlertCircle className="w-4 h-4" />,
            accent: "#f59e0b",
            sub: `${invoices.filter((r) => r.payment_status === "OVERDUE").length} overdue`,
          },
          {
            label: "Avg Tariff",
            value: `৳6.99/kWh`,
            icon: <TrendingUp className="w-4 h-4" />,
            accent: "#8b5cf6",
            sub: "Bulk supply rate",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl bg-[#0f172a] border border-[#1e293b] p-5 space-y-3 hover:border-[#334155] transition-colors"
          >
            <div className="flex items-center justify-between">
              <div
                className="p-2 rounded-lg"
                style={{ background: `${card.accent}20`, border: `1px solid ${card.accent}40` }}
              >
                <div style={{ color: card.accent }}>{card.icon}</div>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{card.label}</p>
              <p className="text-2xl font-bold text-slate-100 font-mono">{card.value}</p>
              <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-[#0f172a] border border-[#1e293b] rounded-lg p-1 w-fit">
        {(["table", "summary", "trends"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? "bg-[#1e293b] text-slate-100"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "table" ? "Invoice Table" : tab === "summary" ? "Utility Summary" : "Revenue Trends"}
          </button>
        ))}
      </div>

      {/* ── Invoice Table Tab ─────────────────────────────────────────────────── */}
      {activeTab === "table" && (
        <div className="rounded-xl bg-[#0f172a] border border-[#1e293b] p-5">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="flex items-center gap-2 bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-500 shrink-0" />
              <input
                type="text"
                placeholder="Search invoice, utility..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-sm text-slate-200 placeholder:text-slate-500 outline-none w-full"
              />
            </div>
            {[
              {
                value: filterUtility,
                setter: setFilterUtility,
                options: ["ALL", ...UTILITIES],
                label: "Utility",
              },
              {
                value: filterStatus,
                setter: (v: any) => setFilterStatus(v),
                options: ["ALL", "PAID", "PARTIAL", "OVERDUE", "PENDING"],
                label: "Status",
              },
              {
                value: filterMonth,
                setter: setFilterMonth,
                options: ["ALL", ...MONTHS.slice(0, 4)],
                label: "Month",
              },
            ].map((f) => (
              <div key={f.label} className="relative">
                <select
                  value={f.value}
                  onChange={(e) => f.setter(e.target.value)}
                  className="appearance-none bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 text-sm text-slate-300 outline-none pr-8 cursor-pointer hover:border-[#475569] transition-colors"
                >
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o === "ALL" ? `All ${f.label}s` : o}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
              </div>
            ))}
            <span className="text-xs text-slate-500 ml-auto">
              {filtered.length} records
            </span>
          </div>

          {/* Filtered totals bar */}
          <div className="flex gap-6 mb-4 p-3 bg-[#1e293b] rounded-lg text-xs">
            <span className="text-slate-500">Filtered:</span>
            <span className="text-slate-300">
              Billed: <span className="text-blue-400 font-mono">{fmtBDT(totalBilled)}</span>
            </span>
            <span className="text-slate-300">
              Collected: <span className="text-emerald-400 font-mono">{fmtBDT(totalCollected)}</span>
            </span>
            <span className="text-slate-300">
              Outstanding: <span className="text-amber-400 font-mono">{fmtBDT(totalOutstanding)}</span>
            </span>
            <span className="text-slate-300">
              Collection Rate: <span className="text-purple-400 font-mono">{fmtPct(overallCollectionRate)}</span>
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1100px]">
              <thead>
                <tr className="border-b border-[#1e293b]">
                  <SortTh label="Invoice #" col="invoice_number" />
                  <SortTh label="Utility" col="utility" />
                  <SortTh label="Month" col="billing_month" />
                  <SortTh label="Sales (MWh)" col="sales_mwh" />
                  <SortTh label="Tariff/kWh" col="tariff_per_kwh" />
                  <SortTh label="Gross (BDT)" col="gross_amount_bdt" />
                  <SortTh label="VAT (BDT)" col="vat_amount_bdt" />
                  <SortTh label="Total (BDT)" col="total_amount_bdt" />
                  <SortTh label="Paid (BDT)" col="paid_amount_bdt" />
                  <SortTh label="Outstanding" col="outstanding_bdt" />
                  <SortTh label="Collected %" col="collection_rate" />
                  <th className="text-left text-slate-500 font-medium pb-3 pr-4 uppercase tracking-wider">Status</th>
                  <SortTh label="Due Date" col="due_date" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b]">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-[#1e293b] transition-colors group">
                    <td className="py-3 pr-4 text-blue-400 font-mono group-hover:text-blue-300 cursor-pointer">
                      {row.invoice_number}
                    </td>
                    <td className="py-3 pr-4 font-semibold text-slate-200">{row.utility}</td>
                    <td className="py-3 pr-4 text-slate-400">{row.billing_month} {row.billing_year}</td>
                    <td className="py-3 pr-4 text-slate-300 font-mono">{row.sales_mwh.toLocaleString()}</td>
                    <td className="py-3 pr-4 text-slate-400 font-mono">৳{row.tariff_per_kwh.toFixed(2)}</td>
                    <td className="py-3 pr-4 text-slate-300 font-mono">{fmtBDT(row.gross_amount_bdt)}</td>
                    <td className="py-3 pr-4 text-slate-400 font-mono">{fmtBDT(row.vat_amount_bdt)}</td>
                    <td className="py-3 pr-4 text-slate-200 font-mono font-semibold">{fmtBDT(row.total_amount_bdt)}</td>
                    <td className="py-3 pr-4 text-emerald-400 font-mono">{fmtBDT(row.paid_amount_bdt)}</td>
                    <td className="py-3 pr-4">
                      <span className={`font-mono ${row.outstanding_bdt > 0 ? "text-amber-400" : "text-slate-500"}`}>
                        {row.outstanding_bdt > 0 ? fmtBDT(row.outstanding_bdt) : "—"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${row.collection_rate}%`,
                              background:
                                row.collection_rate >= 90
                                  ? "#10b981"
                                  : row.collection_rate >= 50
                                  ? "#f59e0b"
                                  : "#ef4444",
                            }}
                          />
                        </div>
                        <span className="text-slate-400 font-mono">{fmtPct(row.collection_rate)}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={row.payment_status} />
                    </td>
                    <td className="py-3 pr-4 text-slate-500 font-mono">{row.due_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Utility Summary Tab ───────────────────────────────────────────────── */}
      {activeTab === "summary" && (
        <div className="space-y-6">
          {/* Bar chart */}
          <div className="rounded-xl bg-[#0f172a] border border-[#1e293b] p-5">
            <h2 className="text-base font-semibold text-slate-100 mb-1">Revenue by Utility</h2>
            <p className="text-xs text-slate-500 mb-5">Billed vs Collected (BDT Millions)</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={summaries.map((s) => ({
                  utility: s.utility,
                  Billed: +(s.total_billed_bdt / 1_000_000).toFixed(1),
                  Collected: +(s.total_collected_bdt / 1_000_000).toFixed(1),
                  Outstanding: +(s.outstanding_bdt / 1_000_000).toFixed(1),
                }))}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="utility" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `৳${v}M`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: "12px", color: "#94a3b8", paddingTop: "12px" }} />
                <Bar dataKey="Billed" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Collected" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Outstanding" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary table */}
          <div className="rounded-xl bg-[#0f172a] border border-[#1e293b] p-5">
            <h2 className="text-base font-semibold text-slate-100 mb-4">Utility-Wise Revenue Summary</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e293b]">
                    {["Utility", "Total Billed", "Total Collected", "Outstanding", "Collection Rate", "Invoices", "Overdue", "Avg Tariff/kWh"].map((h) => (
                      <th key={h} className="text-left text-slate-500 font-medium pb-3 pr-4 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e293b]">
                  {summaries.map((s) => (
                    <tr key={s.utility} className="hover:bg-[#1e293b] transition-colors">
                      <td className="py-3 pr-4 font-bold text-slate-200">{s.utility}</td>
                      <td className="py-3 pr-4 text-blue-400 font-mono">{fmtBDT(s.total_billed_bdt)}</td>
                      <td className="py-3 pr-4 text-emerald-400 font-mono">{fmtBDT(s.total_collected_bdt)}</td>
                      <td className="py-3 pr-4 font-mono">
                        <span className={s.outstanding_bdt > 0 ? "text-amber-400" : "text-slate-500"}>
                          {s.outstanding_bdt > 0 ? fmtBDT(s.outstanding_bdt) : "৳0"}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-[#1e293b] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${s.collection_rate}%`,
                                background: s.collection_rate >= 90 ? "#10b981" : s.collection_rate >= 60 ? "#f59e0b" : "#ef4444",
                              }}
                            />
                          </div>
                          <span className={`font-mono font-semibold ${s.collection_rate >= 90 ? "text-emerald-400" : s.collection_rate >= 60 ? "text-amber-400" : "text-rose-400"}`}>
                            {fmtPct(s.collection_rate)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-slate-400 font-mono">{s.invoices_count}</td>
                      <td className="py-3 pr-4">
                        {s.overdue_count > 0 ? (
                          <span className="text-rose-400 font-mono font-semibold">{s.overdue_count}</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-slate-300 font-mono">৳{s.avg_tariff_per_kwh.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#334155]">
                    <td className="py-3 pr-4 font-bold text-slate-200">Grand Total</td>
                    <td className="py-3 pr-4 text-blue-300 font-mono font-bold">
                      {fmtBDT(summaries.reduce((s, r) => s + r.total_billed_bdt, 0))}
                    </td>
                    <td className="py-3 pr-4 text-emerald-300 font-mono font-bold">
                      {fmtBDT(summaries.reduce((s, r) => s + r.total_collected_bdt, 0))}
                    </td>
                    <td className="py-3 pr-4 text-amber-300 font-mono font-bold">
                      {fmtBDT(summaries.reduce((s, r) => s + r.outstanding_bdt, 0))}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-purple-400 font-mono font-bold">
                        {fmtPct(
                          (summaries.reduce((s, r) => s + r.total_collected_bdt, 0) /
                            summaries.reduce((s, r) => s + r.total_billed_bdt, 0)) *
                            100
                        )}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-300 font-mono">
                      {summaries.reduce((s, r) => s + r.invoices_count, 0)}
                    </td>
                    <td className="py-3 pr-4 text-rose-400 font-mono">
                      {summaries.reduce((s, r) => s + r.overdue_count, 0)}
                    </td>
                    <td className="py-3 pr-4 text-slate-500">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Revenue Trends Tab ────────────────────────────────────────────────── */}
      {activeTab === "trends" && (
        <div className="rounded-xl bg-[#0f172a] border border-[#1e293b] p-5">
          <h2 className="text-base font-semibold text-slate-100 mb-1">Monthly Revenue Trends</h2>
          <p className="text-xs text-slate-500 mb-5">Billed vs Collected vs Outstanding (BDT Millions) — Jan to Apr 2026</p>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `৳${v}M`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: "12px", color: "#94a3b8", paddingTop: "12px" }} />
              <Line type="monotone" dataKey="billed" name="Billed" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4, fill: "#3b82f6" }} />
              <Line type="monotone" dataKey="collected" name="Collected" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: "#10b981" }} />
              <Line type="monotone" dataKey="outstanding" name="Outstanding" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4, fill: "#f59e0b" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
