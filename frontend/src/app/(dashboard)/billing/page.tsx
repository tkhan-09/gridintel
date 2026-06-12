"use client";

import React, { useState, useMemo } from "react";
import {
  FileText,
  Download,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Eye,
  Printer,
  CreditCard,
  TrendingDown,
  Info,
  ExternalLink,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentStatus =
  | "paid"
  | "outstanding"
  | "partial"
  | "overdue"
  | "disputed";

type FuelAdjType = "fuel_surcharge" | "fuel_rebate" | "none";

interface BillingLine {
  id: string;
  invoiceNumber: string;
  utilityId: string;
  utilityName: string;
  utilityShortName: string;
  billingPeriod: string; // "2026-04"
  billingPeriodLabel: string; // "April 2026"
  deliveredEnergyMWh: number;
  ratePerKWh: number; // BDT
  grossBill: number; // BDT
  fuelAdjustmentType: FuelAdjType;
  fuelAdjustmentAmount: number; // BDT (positive = surcharge, negative = rebate)
  penaltyAmount: number; // BDT
  netBill: number; // BDT
  taxAmount: number; // VAT/duty BDT
  totalBillWithTax: number;
  paidAmount: number;
  outstandingBalance: number;
  paymentStatus: PaymentStatus;
  dueDate: string;
  invoiceDate: string;
  paidDate?: string;
  notes?: string;
  powerFactor: number;
  pfPenalty: number; // BDT — from power factor < threshold
}

// ─── Seed data ────────────────────────────────────────────────────────────────

function makeBill(
  id: string,
  invNo: string,
  util: string,
  utilShort: string,
  period: string,
  periodLabel: string,
  mwh: number,
  rate: number,
  fuelType: FuelAdjType,
  fuelAmt: number,
  penalty: number,
  pf: number,
  paid: number,
  status: PaymentStatus,
  dueDate: string,
  invoiceDate: string,
  paidDate?: string,
  notes?: string
): BillingLine {
  const gross = mwh * 1000 * rate; // kWh × rate
  const pfPenalty =
    pf < 0.85 ? Math.round(gross * 0.02) : pf < 0.90 ? Math.round(gross * 0.005) : 0;
  const net = gross + fuelAmt + penalty + pfPenalty;
  const tax = Math.round(net * 0.05); // 5% VAT
  const total = net + tax;
  const outstanding = total - paid;
  return {
    id,
    invoiceNumber: invNo,
    utilityId: util.toLowerCase().replace(" ", "_"),
    utilityName: util,
    utilityShortName: utilShort,
    billingPeriod: period,
    billingPeriodLabel: periodLabel,
    deliveredEnergyMWh: mwh,
    ratePerKWh: rate,
    grossBill: gross,
    fuelAdjustmentType: fuelType,
    fuelAdjustmentAmount: fuelAmt,
    penaltyAmount: penalty,
    netBill: net,
    taxAmount: tax,
    totalBillWithTax: total,
    paidAmount: paid,
    outstandingBalance: outstanding,
    paymentStatus: status,
    dueDate,
    invoiceDate,
    paidDate,
    powerFactor: pf,
    pfPenalty,
    notes,
  };
}

const BILLING_DATA: BillingLine[] = [
  makeBill("b1","BPDB-INV-2026-04-001","Dhaka Power Distribution Company Ltd.","DPDC","2026-04","April 2026",1098.4,8.75,"fuel_surcharge",24850000,0,0.91,0,"outstanding","2026-05-25","2026-05-01",undefined,"Monthly invoice pending approval"),
  makeBill("b2","BPDB-INV-2026-04-002","Dhaka Electric Supply Company Ltd.","DESCO","2026-04","April 2026",718.6,8.75,"fuel_surcharge",16210000,0,0.88,0,"outstanding","2026-05-25","2026-05-01"),
  makeBill("b3","BPDB-INV-2026-04-003","West Zone Power Distribution Company Ltd.","WZPDCO","2026-04","April 2026",581.2,8.60,"none",0,0,0.89,0,"outstanding","2026-05-25","2026-05-01"),
  makeBill("b4","BPDB-INV-2026-04-004","Northern Electric Supply Company Ltd.","NESCO","2026-04","April 2026",381.4,8.55,"none",0,0,0.87,0,"outstanding","2026-05-25","2026-05-01"),
  makeBill("b5","BPDB-INV-2026-04-005","Bangladesh Rural Electrification Board","BREB","2026-04","April 2026",1872.0,8.40,"fuel_rebate",-8500000,0,0.92,0,"outstanding","2026-05-25","2026-05-01"),
  makeBill("b6","BPDB-INV-2026-04-006","BPDB Direct Distribution Division","BPDB Dist.","2026-04","April 2026",532.8,8.50,"none",0,12500000,0.84,0,"outstanding","2026-05-25","2026-05-01","Power factor below threshold — penalty applied"),
  // Previous month
  makeBill("b7","BPDB-INV-2026-03-001","Dhaka Power Distribution Company Ltd.","DPDC","2026-03","March 2026",1072.0,8.75,"fuel_surcharge",22400000,0,0.91,10248750000,"paid","2026-04-25","2026-04-01","2026-04-22"),
  makeBill("b8","BPDB-INV-2026-03-002","Dhaka Electric Supply Company Ltd.","DESCO","2026-03","March 2026",730.0,8.75,"fuel_surcharge",15600000,0,0.88,8100000000,"paid","2026-04-25","2026-04-01","2026-04-18"),
  makeBill("b9","BPDB-INV-2026-03-003","West Zone Power Distribution Company Ltd.","WZPDCO","2026-03","March 2026",560.0,8.60,"none",0,0,0.89,4560000000,"paid","2026-04-25","2026-04-01","2026-04-20"),
  makeBill("b10","BPDB-INV-2026-03-004","Bangladesh Rural Electrification Board","BREB","2026-03","March 2026",1845.0,8.40,"fuel_rebate",-7200000,0,0.92,145000000,"partial","2026-04-25","2026-04-01",undefined,"Partial payment received — balance pending"),
  makeBill("b11","BPDB-INV-2026-02-001","Bangladesh Rural Electrification Board","BREB","2026-02","February 2026",1780.0,8.40,"none",0,0,0.91,0,"overdue","2026-03-25","2026-03-01",undefined,"OVERDUE — 42 days past due date"),
  makeBill("b12","BPDB-INV-2026-01-001","Northern Electric Supply Company Ltd.","NESCO","2026-01","January 2026",365.0,8.55,"none",0,0,0.87,0,"disputed","2026-02-25","2026-02-01",undefined,"Under dispute — meter reading discrepancy"),
];

const STATUS_CFG: Record<PaymentStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  paid: { label: "Paid", cls: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400", icon: <CheckCircle className="w-3 h-3" /> },
  outstanding: { label: "Outstanding", cls: "bg-blue-500/10 border-blue-500/30 text-blue-400", icon: <Clock className="w-3 h-3" /> },
  partial: { label: "Partial", cls: "bg-amber-500/10 border-amber-500/30 text-amber-400", icon: <TrendingDown className="w-3 h-3" /> },
  overdue: { label: "Overdue", cls: "bg-red-500/10 border-red-500/30 text-red-400", icon: <AlertCircle className="w-3 h-3" /> },
  disputed: { label: "Disputed", cls: "bg-purple-500/10 border-purple-500/30 text-purple-400", icon: <XCircle className="w-3 h-3" /> },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-BD", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtBDT(n: number): string {
  if (Math.abs(n) >= 1_00_00_000) {
    return `৳${(n / 1_00_00_000).toFixed(2)} Cr`;
  }
  if (Math.abs(n) >= 1_00_000) {
    return `৳${(n / 1_00_000).toFixed(2)} L`;
  }
  return `৳${fmt(n)}`;
}

async function triggerInvoiceDownload(bill: BillingLine) {
  // In production: POST /api/v1/billing/invoice/{id}/pdf → blob download
  try {
    const res = await fetch(`/api/v1/billing/invoice/${bill.id}/pdf`, {
      method: "GET",
    });
    if (!res.ok) throw new Error("PDF generation failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bill.invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    alert(`Invoice PDF: ${bill.invoiceNumber}\nIn production this triggers PDF download via /api/v1/billing/invoice/${bill.id}/pdf`);
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PaymentStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.cls} uppercase tracking-wider`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function ExpandedBillDetail({ bill }: { bill: BillingLine }) {
  return (
    <tr className="bg-slate-900/60">
      <td colSpan={12} className="px-6 py-4">
        <div className="grid grid-cols-3 gap-6">
          {/* Calculation breakdown */}
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Billing Calculation</p>
            {[
              ["Delivered Energy", `${fmt(bill.deliveredEnergyMWh, 1)} MWh`],
              ["Rate per kWh", `৳ ${bill.ratePerKWh.toFixed(4)}`],
              ["Gross Bill", fmtBDT(bill.grossBill)],
              [
                bill.fuelAdjustmentType === "fuel_surcharge"
                  ? "Fuel Surcharge (+)"
                  : bill.fuelAdjustmentType === "fuel_rebate"
                    ? "Fuel Rebate (−)"
                    : "Fuel Adjustment",
                bill.fuelAdjustmentType !== "none"
                  ? fmtBDT(bill.fuelAdjustmentAmount)
                  : "—",
              ],
              ["Penalty/Late Fee", bill.penaltyAmount > 0 ? fmtBDT(bill.penaltyAmount) : "—"],
              ["PF Penalty", bill.pfPenalty > 0 ? fmtBDT(bill.pfPenalty) : "—"],
              ["Net Bill (excl. tax)", fmtBDT(bill.netBill)],
              ["VAT / Duty (5%)", fmtBDT(bill.taxAmount)],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between text-xs py-0.5 border-b border-slate-800/40">
                <span className="text-slate-500">{label}</span>
                <span className="font-mono text-slate-200">{val}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs py-1 font-bold border-t border-slate-600/40 mt-1">
              <span className="text-cyan-400">Total Bill (incl. tax)</span>
              <span className="font-mono text-cyan-300">{fmtBDT(bill.totalBillWithTax)}</span>
            </div>
          </div>

          {/* Payment tracking */}
          <div className="space-y-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Payment Status</p>
            {[
              ["Invoice Date", bill.invoiceDate],
              ["Due Date", bill.dueDate],
              ["Paid Date", bill.paidDate ?? "—"],
              ["Amount Paid", fmtBDT(bill.paidAmount)],
              ["Outstanding Balance", fmtBDT(bill.outstandingBalance)],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between text-xs py-0.5 border-b border-slate-800/40">
                <span className="text-slate-500">{label}</span>
                <span className={`font-mono ${label === "Outstanding Balance" && bill.outstandingBalance > 0 ? "text-amber-400" : "text-slate-200"}`}>
                  {val}
                </span>
              </div>
            ))}
            {bill.notes && (
              <div className="mt-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-300">
                <AlertCircle className="w-3 h-3 inline mr-1" />
                {bill.notes}
              </div>
            )}
          </div>

          {/* Actions */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">Invoice Actions</p>
            <div className="space-y-2">
              <button
                onClick={() => triggerInvoiceDownload(bill)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download Invoice PDF
              </button>
              <button className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs border border-slate-600 hover:border-slate-400 text-slate-300 rounded-lg transition-colors">
                <Printer className="w-3.5 h-3.5" />
                Print Invoice
              </button>
              <button className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs border border-emerald-700/50 hover:border-emerald-500/50 text-emerald-400 rounded-lg transition-colors">
                <CreditCard className="w-3.5 h-3.5" />
                Record Payment
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "all">("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<keyof BillingLine>("invoiceDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const periods = useMemo(
    () => Array.from(new Set(BILLING_DATA.map((b) => b.billingPeriod))).sort().reverse(),
    []
  );

  const filtered = useMemo(() => {
    let data = [...BILLING_DATA];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (b) =>
          b.invoiceNumber.toLowerCase().includes(q) ||
          b.utilityShortName.toLowerCase().includes(q) ||
          b.utilityName.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      data = data.filter((b) => b.paymentStatus === statusFilter);
    }
    if (periodFilter !== "all") {
      data = data.filter((b) => b.billingPeriod === periodFilter);
    }
    data.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "desc" ? -cmp : cmp;
    });
    return data;
  }, [searchQuery, statusFilter, periodFilter, sortKey, sortDir]);

  function handleSort(key: keyof BillingLine) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const SortIcon = ({ col }: { col: keyof BillingLine }) =>
    col !== sortKey ? null : sortDir === "desc" ? (
      <ChevronDown className="w-3 h-3 ml-0.5 inline" />
    ) : (
      <ChevronUp className="w-3 h-3 ml-0.5 inline" />
    );

  // Summary KPIs
  const allOutstanding = BILLING_DATA.filter(
    (b) => b.paymentStatus !== "paid"
  );
  const totalOutstanding = allOutstanding.reduce(
    (a, b) => a + b.outstandingBalance,
    0
  );
  const overdueCount = BILLING_DATA.filter(
    (b) => b.paymentStatus === "overdue"
  ).length;
  const currentMonthTotal = BILLING_DATA.filter(
    (b) => b.billingPeriod === "2026-04"
  ).reduce((a, b) => a + b.totalBillWithTax, 0);
  const collectionRate =
    (BILLING_DATA.filter((b) => b.paymentStatus === "paid").length /
      BILLING_DATA.length) *
    100;

  return (
    <div className="min-h-screen bg-[#070d1a] text-slate-100 font-['IBM_Plex_Mono',monospace]">
      {/* Header */}
      <div className="border-b border-slate-800/60 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-cyan-400 tracking-tight">
              Financial Control Ledger — Billing
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Utility billing lines · deductions · net bills · invoice management
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-700 hover:border-slate-500 bg-slate-800 rounded-md transition-colors">
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-700 hover:border-slate-500 bg-slate-800 rounded-md transition-colors">
              <Download className="w-3 h-3" />
              Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* KPI summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-4">
        {[
          {
            label: "Total Outstanding",
            value: fmtBDT(totalOutstanding),
            sub: `${allOutstanding.length} invoices`,
            cls: "border-amber-800/40",
            icon: <AlertCircle className="w-4 h-4 text-amber-400" />,
          },
          {
            label: "Current Month Billing",
            value: fmtBDT(currentMonthTotal),
            sub: "April 2026",
            cls: "border-cyan-800/40",
            icon: <FileText className="w-4 h-4 text-cyan-400" />,
          },
          {
            label: "Overdue Invoices",
            value: `${overdueCount}`,
            sub: overdueCount > 0 ? "Immediate action required" : "All current",
            cls: overdueCount > 0 ? "border-red-800/40" : "border-emerald-800/40",
            icon:
              overdueCount > 0 ? (
                <XCircle className="w-4 h-4 text-red-400" />
              ) : (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              ),
          },
          {
            label: "Collection Rate",
            value: `${collectionRate.toFixed(1)}%`,
            sub: `${BILLING_DATA.filter((b) => b.paymentStatus === "paid").length} / ${BILLING_DATA.length} invoices`,
            cls: "border-emerald-800/40",
            icon: <CheckCircle className="w-4 h-4 text-emerald-400" />,
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`bg-slate-900/60 border ${kpi.cls} rounded-xl px-4 py-3`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                {kpi.label}
              </span>
              {kpi.icon}
            </div>
            <div className="text-lg font-bold text-slate-100 font-mono">
              {kpi.value}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Overdue banner */}
      {overdueCount > 0 && (
        <div className="mx-6 mb-3 flex items-center gap-3 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            <strong>{overdueCount} invoice(s)</strong> are past due date. Immediate follow-up required. Outstanding amount:{" "}
            <strong>
              {fmtBDT(
                BILLING_DATA.filter((b) => b.paymentStatus === "overdue").reduce(
                  (a, b) => a + b.outstandingBalance,
                  0
                )
              )}
            </strong>
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 pb-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          <input
            type="text"
            placeholder="Search invoice, utility..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-7 pr-3 py-1.5 text-xs bg-slate-800 border border-slate-700 focus:border-cyan-500 rounded-md text-slate-200 outline-none w-52"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as PaymentStatus | "all")
          }
          className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-md text-slate-200 outline-none focus:border-cyan-500"
        >
          <option value="all">All Status</option>
          <option value="outstanding">Outstanding</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="overdue">Overdue</option>
          <option value="disputed">Disputed</option>
        </select>

        <select
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-md text-slate-200 outline-none focus:border-cyan-500"
        >
          <option value="all">All Periods</option>
          {periods.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <span className="text-[10px] text-slate-600 ml-auto">
          {filtered.length} invoice(s)
        </span>
      </div>

      {/* Billing Table */}
      <div className="px-6 pb-6 overflow-x-auto">
        <table className="w-full text-[11px] border-collapse min-w-[1400px]">
          <thead>
            <tr className="text-slate-500 uppercase tracking-wider">
              {(
                [
                  ["Invoice No.", "invoiceNumber", "left", "min-w-[160px]"],
                  ["Utility", "utilityShortName", "left", "min-w-[120px]"],
                  ["Period", "billingPeriod", "center", "min-w-[90px]"],
                  ["Energy (MWh)", "deliveredEnergyMWh", "right", "min-w-[100px]"],
                  ["Rate/kWh (৳)", "ratePerKWh", "right", "min-w-[90px]"],
                  ["Gross Bill", "grossBill", "right", "min-w-[120px]"],
                  ["Fuel/Penalty Adj.", "fuelAdjustmentAmount", "right", "min-w-[120px]"],
                  ["Net Bill", "netBill", "right", "min-w-[110px]"],
                  ["Total (w/ Tax)", "totalBillWithTax", "right", "min-w-[120px]"],
                  ["Outstanding", "outstandingBalance", "right", "min-w-[110px]"],
                  ["Status", "paymentStatus", "center", "min-w-[100px]"],
                  ["", "id", "center", "min-w-[120px]"],
                ] as [string, keyof BillingLine, string, string][]
              ).map(([label, key, align, minW]) => (
                <th
                  key={key}
                  onClick={() => key !== "id" && handleSort(key)}
                  className={`px-3 py-2 text-${align} font-semibold bg-slate-900/80 border-b border-slate-700/60 ${minW} ${key !== "id" ? "cursor-pointer hover:text-slate-200" : ""}`}
                >
                  {label}
                  {key !== "id" && <SortIcon col={key} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((bill, idx) => {
              const isExpanded = expandedId === bill.id;
              const isOverdue = bill.paymentStatus === "overdue";
              const isDisputed = bill.paymentStatus === "disputed";

              return (
                <React.Fragment key={bill.id}>
                  <tr
                    className={`border-b border-slate-800/40 transition-colors hover:bg-slate-800/20 ${
                      isOverdue
                        ? "bg-red-500/5"
                        : isDisputed
                          ? "bg-purple-500/5"
                          : idx % 2 === 0
                            ? "bg-slate-900/10"
                            : ""
                    }`}
                  >
                    {/* Invoice number */}
                    <td className="px-3 py-2">
                      <span className="text-cyan-400 font-semibold">
                        {bill.invoiceNumber}
                      </span>
                    </td>

                    {/* Utility */}
                    <td className="px-3 py-2">
                      <div>
                        <p className="font-semibold text-slate-200">
                          {bill.utilityShortName}
                        </p>
                        <p className="text-[9px] text-slate-600 max-w-[110px] truncate">
                          {bill.utilityName}
                        </p>
                      </div>
                    </td>

                    {/* Period */}
                    <td className="px-3 py-2 text-center text-slate-400">
                      {bill.billingPeriodLabel}
                    </td>

                    {/* Energy */}
                    <td className="px-3 py-2 text-right font-mono text-slate-300">
                      {fmt(bill.deliveredEnergyMWh, 1)}
                    </td>

                    {/* Rate */}
                    <td className="px-3 py-2 text-right font-mono text-slate-300">
                      {bill.ratePerKWh.toFixed(4)}
                    </td>

                    {/* Gross bill */}
                    <td className="px-3 py-2 text-right font-mono text-slate-200">
                      {fmtBDT(bill.grossBill)}
                    </td>

                    {/* Fuel / Penalty adjustment */}
                    <td className="px-3 py-2 text-right font-mono">
                      {bill.fuelAdjustmentType !== "none" || bill.penaltyAmount > 0 || bill.pfPenalty > 0 ? (
                        <div className="flex flex-col items-end gap-0.5">
                          {bill.fuelAdjustmentType !== "none" && (
                            <span
                              className={
                                bill.fuelAdjustmentAmount > 0
                                  ? "text-red-400"
                                  : "text-emerald-400"
                              }
                            >
                              {bill.fuelAdjustmentAmount > 0 ? "+" : ""}
                              {fmtBDT(bill.fuelAdjustmentAmount)}
                              <span className="text-[9px] text-slate-600 ml-1">
                                {bill.fuelAdjustmentType === "fuel_surcharge"
                                  ? "(surcharge)"
                                  : "(rebate)"}
                              </span>
                            </span>
                          )}
                          {bill.penaltyAmount > 0 && (
                            <span className="text-red-400">
                              +{fmtBDT(bill.penaltyAmount)}
                              <span className="text-[9px] text-slate-600 ml-1">
                                (penalty)
                              </span>
                            </span>
                          )}
                          {bill.pfPenalty > 0 && (
                            <span className="text-amber-400">
                              +{fmtBDT(bill.pfPenalty)}
                              <span className="text-[9px] text-slate-600 ml-1">
                                (PF)
                              </span>
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Net bill */}
                    <td className="px-3 py-2 text-right font-mono text-slate-100 font-semibold">
                      {fmtBDT(bill.netBill)}
                    </td>

                    {/* Total with tax */}
                    <td className="px-3 py-2 text-right font-mono font-bold text-cyan-300">
                      {fmtBDT(bill.totalBillWithTax)}
                    </td>

                    {/* Outstanding */}
                    <td className="px-3 py-2 text-right font-mono">
                      <span
                        className={
                          bill.outstandingBalance === 0
                            ? "text-slate-600"
                            : bill.paymentStatus === "overdue"
                              ? "text-red-400 font-bold"
                              : "text-amber-400"
                        }
                      >
                        {bill.outstandingBalance === 0
                          ? "—"
                          : fmtBDT(bill.outstandingBalance)}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2 text-center">
                      <StatusBadge status={bill.paymentStatus} />
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() =>
                            setExpandedId(isExpanded ? null : bill.id)
                          }
                          className="p-1 text-slate-500 hover:text-slate-200 transition-colors"
                          title="View details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => triggerInvoiceDownload(bill)}
                          className="p-1 text-slate-500 hover:text-cyan-400 transition-colors"
                          title="Download invoice PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && <ExpandedBillDetail bill={bill} />}
                </React.Fragment>
              );
            })}

            {/* Summary totals row */}
            <tr className="bg-slate-800/40 border-t-2 border-slate-600/40 font-bold">
              <td
                colSpan={3}
                className="px-3 py-2 text-xs text-cyan-400 uppercase tracking-wider"
              >
                TOTAL (filtered)
              </td>
              <td className="px-3 py-2 text-right font-mono text-cyan-300">
                {fmt(
                  filtered.reduce((a, b) => a + b.deliveredEnergyMWh, 0),
                  1
                )}
              </td>
              <td />
              <td className="px-3 py-2 text-right font-mono text-cyan-300">
                {fmtBDT(filtered.reduce((a, b) => a + b.grossBill, 0))}
              </td>
              <td />
              <td className="px-3 py-2 text-right font-mono text-cyan-300">
                {fmtBDT(filtered.reduce((a, b) => a + b.netBill, 0))}
              </td>
              <td className="px-3 py-2 text-right font-mono text-cyan-200 font-extrabold">
                {fmtBDT(filtered.reduce((a, b) => a + b.totalBillWithTax, 0))}
              </td>
              <td className="px-3 py-2 text-right font-mono text-amber-400">
                {fmtBDT(filtered.reduce((a, b) => a + b.outstandingBalance, 0))}
              </td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="px-6 pb-6">
        <div className="flex items-start gap-2 text-[10px] text-slate-600 leading-relaxed">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            All amounts in BDT (Bangladeshi Taka). Fuel surcharges per BPDB
            Gazette notification. Power Factor penalty: 2% for PF &lt; 0.85,
            0.5% for PF 0.85–0.90 per contract clause. VAT 5% per NBR order.
            Invoice PDF generated via ReportLab backend service.
          </span>
        </div>
      </div>
    </div>
  );
}
