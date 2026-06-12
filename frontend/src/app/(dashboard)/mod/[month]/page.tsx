"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle,
  Lock,
  Save,
  Send,
  ShieldCheck,
  ChevronDown,
  Info,
  RefreshCw,
  XCircle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Role = "operator" | "auditor" | "admin";

type SubmissionStatus = "draft" | "submitted" | "verified" | "locked";

interface MeterRow {
  id: string;
  plantId: string;
  plantName: string;
  meterTag: string;
  subUnit?: string; // for CCPP GT/ST
  isCCPP: boolean;
  isTotalRow?: boolean;
  prevClosing: number | null; // from last month — read-only pre-fill
  opening: number;
  closing: number;
  multiplier: number;
  activeEnergy: number; // kWh — auto-calc
  reactiveEnergy: number; // kVarh — user entry
  stationUse: number; // kWh
  grossGeneration: number; // auto-calc
  netGeneration: number; // auto-calc
  omf: number; // Outage Management Factor %
  cfFactor: number; // Capacity Factor
  status: SubmissionStatus;
  continuityOk: boolean;
  isEditable: boolean;
}

interface MonthLockInfo {
  isLocked: boolean;
  lockedBy?: string;
  lockedAt?: string;
}

interface ApiError {
  field: string;
  message: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SubmissionStatus,
  { label: string; color: string; bg: string }
> = {
  draft: {
    label: "Draft",
    color: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/30",
  },
  submitted: {
    label: "Submitted",
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/30",
  },
  verified: {
    label: "Verified",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/30",
  },
  locked: {
    label: "Locked",
    color: "text-slate-400",
    bg: "bg-slate-400/10 border-slate-400/30",
  },
};

// ─── Mock seed data (replace with real API) ──────────────────────────────────

function buildInitialRows(monthStr: string): MeterRow[] {
  const plants = [
    {
      id: "p1",
      name: "Ashuganj 225MW",
      tag: "ASH-GT-01",
      isCCPP: false,
      prevClosing: 182340.5,
      omf: 12.5,
      cf: 68.4,
    },
    {
      id: "p2",
      name: "Ghorashal 630MW",
      tag: "GHO-GT-01",
      isCCPP: false,
      prevClosing: 541200.0,
      omf: 8.2,
      cf: 72.1,
    },
    {
      id: "p3",
      name: "Haripur 412MW (GT)",
      tag: "HAR-GT-01",
      isCCPP: true,
      subUnit: "GT",
      prevClosing: 310450.75,
      omf: 5.0,
      cf: 75.3,
    },
    {
      id: "p4",
      name: "Haripur 412MW (ST)",
      tag: "HAR-ST-01",
      isCCPP: true,
      subUnit: "ST",
      prevClosing: 155200.25,
      omf: 5.0,
      cf: 38.9,
    },
    {
      id: "p5",
      name: "Meghnaghat 450MW",
      tag: "MEG-GT-01",
      isCCPP: false,
      prevClosing: 398760.0,
      omf: 10.0,
      cf: 69.8,
    },
    {
      id: "p6",
      name: "Siddhirgonj 210MW",
      tag: "SID-GT-01",
      isCCPP: false,
      prevClosing: 184500.5,
      omf: 15.3,
      cf: 61.2,
    },
    {
      id: "p7",
      name: "Payra 1320MW",
      tag: "PAY-ST-01",
      isCCPP: false,
      prevClosing: 1102340.0,
      omf: 6.8,
      cf: 80.5,
    },
    {
      id: "p8",
      name: "Barapukuria 525MW",
      tag: "BAR-ST-01",
      isCCPP: false,
      prevClosing: 441200.0,
      omf: 9.5,
      cf: 74.2,
    },
    {
      id: "p9",
      name: "Cumilla 225MW",
      tag: "CUM-GT-01",
      isCCPP: false,
      prevClosing: 178900.0,
      omf: 11.0,
      cf: 65.7,
    },
  ];

  return plants.map((p) => {
    const opening = p.prevClosing ?? 0;
    const closing = opening + Math.round(Math.random() * 50000 + 10000);
    const multiplier = 400;
    const gross = (closing - opening) * multiplier;
    const stationUse = Math.round(gross * 0.032);
    const net = gross - stationUse;
    return {
      id: p.id,
      plantId: p.id,
      plantName: p.name,
      meterTag: p.tag,
      subUnit: p.subUnit,
      isCCPP: p.isCCPP,
      prevClosing: p.prevClosing,
      opening,
      closing,
      multiplier,
      activeEnergy: gross,
      reactiveEnergy: Math.round(gross * 0.18),
      stationUse,
      grossGeneration: gross,
      netGeneration: net,
      omf: p.omf,
      cfFactor: p.cf,
      status: "draft",
      continuityOk: true,
      isEditable: true,
    };
  });
}

// ─── Calculation helpers ──────────────────────────────────────────────────────

function recalcRow(row: MeterRow): MeterRow {
  const gross = (row.closing - row.opening) * row.multiplier;
  const net = gross - row.stationUse;
  return {
    ...row,
    activeEnergy: gross,
    grossGeneration: gross,
    netGeneration: net,
    continuityOk:
      row.prevClosing === null ? true : row.opening === row.prevClosing,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.bg} ${cfg.color} uppercase tracking-wider`}
    >
      {status === "locked" && <Lock className="w-2.5 h-2.5" />}
      {status === "verified" && <CheckCircle className="w-2.5 h-2.5" />}
      {cfg.label}
    </span>
  );
}

function NumericCell({
  value,
  onChange,
  disabled,
  highlight,
  decimals = 2,
  min,
}: {
  value: number;
  onChange?: (v: number) => void;
  disabled: boolean;
  highlight?: "error" | "warning";
  decimals?: number;
  min?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setRaw(value.toFixed(decimals));
  }, [value, editing, decimals]);

  const borderClass =
    highlight === "error"
      ? "border-red-500 bg-red-500/10 text-red-300"
      : highlight === "warning"
        ? "border-amber-500 bg-amber-500/10 text-amber-300"
        : "border-slate-600 bg-slate-800/60";

  if (disabled) {
    return (
      <div
        className={`px-2 py-1 text-right text-xs font-mono rounded border ${borderClass} text-slate-300 select-text`}
      >
        {value.toLocaleString("en-BD", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      value={editing ? raw : value.toFixed(decimals)}
      min={min}
      onFocus={() => {
        setEditing(true);
        setRaw(String(value));
        setTimeout(() => inputRef.current?.select(), 0);
      }}
      onBlur={() => {
        setEditing(false);
        const parsed = parseFloat(raw);
        if (!isNaN(parsed)) onChange?.(parsed);
      }}
      onChange={(e) => setRaw(e.target.value)}
      className={`w-full px-2 py-1 text-right text-xs font-mono rounded border ${borderClass} focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 outline-none transition-all`}
    />
  );
}

function ContinuityAlert({ rows }: { rows: MeterRow[] }) {
  const failed = rows.filter((r) => !r.continuityOk);
  if (!failed.length) return null;
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-red-500/10 border border-red-500/40 rounded-lg text-sm">
      <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-red-300 font-semibold">
          Continuity Check Failed — {failed.length} meter
          {failed.length > 1 ? "s" : ""}
        </p>
        <p className="text-red-400/80 text-xs mt-0.5">
          Opening reading does not match previous month's closing for:{" "}
          {failed.map((r) => r.meterTag).join(", ")}
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MODEntryPage() {
  const params = useParams();
  const router = useRouter();
  const monthParam = (params?.month as string) ?? "2026-04";

  // Auth (read from Zustand in production; mocked here)
  const userRole: Role = "admin";
  const userName = "Md. Rafiqul Islam";

  // State
  const [rows, setRows] = useState<MeterRow[]>(() =>
    buildInitialRows(monthParam)
  );
  const [lockInfo, setLockInfo] = useState<MonthLockInfo>({ isLocked: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [cfWarningRowId, setCfWarningRowId] = useState<string | null>(null);
  const [expandedPlants, setExpandedPlants] = useState<Set<string>>(
    new Set(["p3", "p4"])
  );

  // Parse display month
  const [year, mon] = monthParam.split("-").map(Number);
  const displayMonth = new Date(year, mon - 1, 1).toLocaleString("en-BD", {
    month: "long",
    year: "numeric",
  });

  // Totals
  const totals = rows.reduce(
    (acc, r) => ({
      grossGeneration: acc.grossGeneration + r.grossGeneration,
      stationUse: acc.stationUse + r.stationUse,
      netGeneration: acc.netGeneration + r.netGeneration,
      activeEnergy: acc.activeEnergy + r.activeEnergy,
      reactiveEnergy: acc.reactiveEnergy + r.reactiveEnergy,
    }),
    {
      grossGeneration: 0,
      stationUse: 0,
      netGeneration: 0,
      activeEnergy: 0,
      reactiveEnergy: 0,
    }
  );

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }

  // Row field update
  const updateRow = useCallback(
    (id: string, field: keyof MeterRow, value: number) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const updated = { ...r, [field]: value };
          if (field === "cfFactor" && Math.abs(value - r.cfFactor) > 5) {
            setCfWarningRowId(id);
            setTimeout(() => setCfWarningRowId(null), 5000);
          }
          return recalcRow(updated);
        })
      );
    },
    []
  );

  // ── API calls ──
  async function apiCall(
    endpoint: string,
    payload: object
  ): Promise<{ ok: boolean; message?: string }> {
    try {
      const res = await fetch(`/api/v1/mod/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: monthParam, rows, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, message: data?.message };
    } catch {
      return { ok: false, message: "Network error. Please retry." };
    }
  }

  async function handleSaveDraft() {
    setIsSaving(true);
    const result = await apiCall("save-draft", {});
    setIsSaving(false);
    if (result.ok) {
      showToast("success", "Draft saved successfully.");
    } else {
      showToast("error", result.message ?? "Failed to save draft.");
    }
  }

  async function handleSubmit() {
    const failedContinuity = rows.some((r) => !r.continuityOk);
    if (failedContinuity) {
      showToast(
        "error",
        "Cannot submit: fix continuity errors before submitting."
      );
      return;
    }
    setIsSubmitting(true);
    const result = await apiCall("submit", {});
    setIsSubmitting(false);
    if (result.ok) {
      setRows((prev) => prev.map((r) => ({ ...r, status: "submitted" })));
      showToast("success", "MOD submitted for verification.");
    } else {
      showToast("error", result.message ?? "Submission failed.");
    }
  }

  async function handleVerify() {
    setIsVerifying(true);
    const result = await apiCall("verify", {});
    setIsVerifying(false);
    if (result.ok) {
      setRows((prev) => prev.map((r) => ({ ...r, status: "verified" })));
      showToast("success", "MOD data verified.");
    } else {
      showToast("error", result.message ?? "Verification failed.");
    }
  }

  async function handleLockMonth() {
    if (
      !confirm(
        `Lock ${displayMonth}? This will disable all edits. This action cannot be undone.`
      )
    )
      return;
    setIsLocking(true);
    const result = await apiCall("lock", {});
    setIsLocking(false);
    if (result.ok) {
      setRows((prev) =>
        prev.map((r) => ({ ...r, status: "locked", isEditable: false }))
      );
      setLockInfo({
        isLocked: true,
        lockedBy: userName,
        lockedAt: new Date().toISOString(),
      });
      showToast("success", `${displayMonth} has been locked.`);
    } else {
      showToast("error", result.message ?? "Lock failed.");
    }
  }

  // ── Render ──

  const isAllLocked = lockInfo.isLocked;
  const continuityErrors = rows.filter((r) => !r.continuityOk);

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-100 font-['IBM_Plex_Mono',monospace]">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl border text-sm font-medium transition-all ${
            toast.type === "success"
              ? "bg-emerald-950 border-emerald-500/50 text-emerald-300"
              : "bg-red-950 border-red-500/50 text-red-300"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#0a0f1e]/95 backdrop-blur border-b border-slate-800/60">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-base font-bold text-cyan-400 tracking-tight">
                MOD Entry — Meter Operational Data
              </h1>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Period:{" "}
                <span className="text-slate-300 font-semibold">
                  {displayMonth}
                </span>{" "}
                &nbsp;|&nbsp; BPDB National Grid
              </p>
            </div>
            {isAllLocked && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 border border-slate-600 rounded-full text-xs text-slate-400">
                <Lock className="w-3 h-3" />
                Locked by {lockInfo.lockedBy}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {(userRole === "operator" || userRole === "admin") &&
              !isAllLocked && (
                <>
                  <button
                    onClick={handleSaveDraft}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 rounded-md transition-colors disabled:opacity-50"
                  >
                    {isSaving ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3" />
                    )}
                    Save Draft
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 border border-blue-500 rounded-md transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    Submit
                  </button>
                </>
              )}

            {(userRole === "auditor" || userRole === "admin") &&
              !isAllLocked && (
                <button
                  onClick={handleVerify}
                  disabled={isVerifying}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 rounded-md transition-colors disabled:opacity-50"
                >
                  {isVerifying ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3 h-3" />
                  )}
                  Verify
                </button>
              )}

            {userRole === "admin" && !isAllLocked && (
              <button
                onClick={handleLockMonth}
                disabled={isLocking}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-orange-700 hover:bg-orange-600 border border-orange-600 rounded-md transition-colors disabled:opacity-50"
              >
                {isLocking ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Lock className="w-3 h-3" />
                )}
                Lock Month
              </button>
            )}
          </div>
        </div>

        {/* Alert banners */}
        <div className="px-6 pb-3 space-y-2">
          {isAllLocked && (
            <div className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/30 rounded-lg text-xs text-orange-300">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              This month is locked. All fields are read-only. Use Adjustment
              Request to modify data.
            </div>
          )}
          <ContinuityAlert rows={rows} />
          {cfWarningRowId && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              CF value changed by more than 5% — please verify with official
              plant record before submitting.
            </div>
          )}
        </div>
      </div>

      {/* Ledger Grid */}
      <div className="px-4 py-4 overflow-x-auto">
        <table className="w-full text-[11px] border-collapse min-w-[1400px]">
          <thead>
            <tr className="text-slate-500 uppercase tracking-wider">
              <th className="px-2 py-2 text-left font-semibold bg-slate-900/80 border-b border-slate-700/60 sticky left-0 z-10 min-w-[180px]">
                Plant / Meter
              </th>
              <th className="px-2 py-2 text-center font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[90px]">
                Status
              </th>
              <th className="px-2 py-2 text-right font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[100px]">
                Prev. Closing
              </th>
              <th className="px-2 py-2 text-right font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[100px]">
                Opening
              </th>
              <th className="px-2 py-2 text-right font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[100px]">
                Closing
              </th>
              <th className="px-2 py-2 text-right font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[80px]">
                Multiplier
              </th>
              <th className="px-2 py-2 text-right font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[110px]">
                Active Energy (kWh)
              </th>
              <th className="px-2 py-2 text-right font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[110px]">
                Reactive (kVArh)
              </th>
              <th className="px-2 py-2 text-right font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[110px]">
                Station Use (kWh)
              </th>
              <th className="px-2 py-2 text-right font-semibold bg-[#0e2a1f]/80 border-b border-emerald-800/40 min-w-[120px] text-emerald-500">
                Net Generation
              </th>
              <th className="px-2 py-2 text-right font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[70px]">
                OMF %
              </th>
              <th className="px-2 py-2 text-right font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[70px]">
                CF %
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, idx) => {
              const hasContinuityError = !row.continuityOk;
              const isCCPPTotal = row.isTotalRow;
              const disabled = isAllLocked || !row.isEditable || isCCPPTotal;
              const rowBg = isCCPPTotal
                ? "bg-slate-800/40"
                : idx % 2 === 0
                  ? "bg-slate-900/20"
                  : "bg-transparent";

              return (
                <tr
                  key={row.id}
                  className={`${rowBg} border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors group`}
                >
                  {/* Plant/Meter name */}
                  <td className="px-2 py-1.5 sticky left-0 z-10 bg-inherit">
                    <div className="flex flex-col">
                      <span
                        className={`font-semibold ${isCCPPTotal ? "text-cyan-400" : "text-slate-200"}`}
                      >
                        {row.isCCPP && row.subUnit && (
                          <span className="text-slate-500 mr-1">
                            [{row.subUnit}]
                          </span>
                        )}
                        {row.plantName}
                      </span>
                      <span className="text-slate-600 text-[10px]">
                        {row.meterTag}
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-2 py-1.5 text-center">
                    <StatusBadge status={row.status} />
                  </td>

                  {/* Prev Closing — read only */}
                  <td className="px-2 py-1.5">
                    <div className="px-2 py-1 text-right text-xs font-mono text-slate-500 rounded border border-slate-700/40 bg-slate-800/30">
                      {row.prevClosing !== null
                        ? row.prevClosing.toLocaleString("en-BD", {
                            minimumFractionDigits: 2,
                          })
                        : "—"}
                    </div>
                  </td>

                  {/* Opening */}
                  <td className="px-2 py-1.5">
                    <NumericCell
                      value={row.opening}
                      onChange={(v) => updateRow(row.id, "opening", v)}
                      disabled={disabled}
                      highlight={hasContinuityError ? "error" : undefined}
                      decimals={2}
                    />
                  </td>

                  {/* Closing */}
                  <td className="px-2 py-1.5">
                    <NumericCell
                      value={row.closing}
                      onChange={(v) => updateRow(row.id, "closing", v)}
                      disabled={disabled}
                      decimals={2}
                    />
                  </td>

                  {/* Multiplier */}
                  <td className="px-2 py-1.5">
                    <NumericCell
                      value={row.multiplier}
                      onChange={(v) => updateRow(row.id, "multiplier", v)}
                      disabled={disabled}
                      decimals={0}
                      min={1}
                    />
                  </td>

                  {/* Active Energy — auto-calc */}
                  <td className="px-2 py-1.5">
                    <NumericCell
                      value={row.activeEnergy}
                      disabled={true}
                      decimals={0}
                    />
                  </td>

                  {/* Reactive Energy */}
                  <td className="px-2 py-1.5">
                    <NumericCell
                      value={row.reactiveEnergy}
                      onChange={(v) => updateRow(row.id, "reactiveEnergy", v)}
                      disabled={disabled}
                      decimals={0}
                    />
                  </td>

                  {/* Station Use */}
                  <td className="px-2 py-1.5">
                    <NumericCell
                      value={row.stationUse}
                      onChange={(v) => updateRow(row.id, "stationUse", v)}
                      disabled={disabled}
                      decimals={0}
                    />
                  </td>

                  {/* Net Generation — computed highlight */}
                  <td className="px-2 py-1.5">
                    <div
                      className={`px-2 py-1 text-right text-xs font-mono font-bold rounded border ${
                        row.netGeneration < 0
                          ? "border-red-500/50 bg-red-500/10 text-red-400"
                          : "border-emerald-700/40 bg-emerald-900/20 text-emerald-400"
                      }`}
                    >
                      {row.netGeneration.toLocaleString("en-BD", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </div>
                  </td>

                  {/* OMF */}
                  <td className="px-2 py-1.5">
                    <NumericCell
                      value={row.omf}
                      onChange={(v) => updateRow(row.id, "omf", v)}
                      disabled={disabled}
                      decimals={1}
                      highlight={row.omf > 20 ? "warning" : undefined}
                    />
                  </td>

                  {/* CF */}
                  <td className="px-2 py-1.5">
                    <NumericCell
                      value={row.cfFactor}
                      onChange={(v) => updateRow(row.id, "cfFactor", v)}
                      disabled={disabled}
                      decimals={1}
                      highlight={
                        row.id === cfWarningRowId ? "warning" : undefined
                      }
                    />
                  </td>
                </tr>
              );
            })}

            {/* Totals row */}
            <tr className="bg-cyan-900/20 border-t-2 border-cyan-700/40 font-bold">
              <td
                colSpan={2}
                className="px-2 py-2 sticky left-0 bg-[#071420] z-10 text-cyan-400 text-xs uppercase tracking-wider"
              >
                TOTAL — All Plants
              </td>
              <td />
              <td />
              <td />
              <td />
              <td className="px-2 py-2 text-right text-xs font-mono text-cyan-300">
                {totals.activeEnergy.toLocaleString("en-BD", {
                  maximumFractionDigits: 0,
                })}
              </td>
              <td className="px-2 py-2 text-right text-xs font-mono text-cyan-300">
                {totals.reactiveEnergy.toLocaleString("en-BD", {
                  maximumFractionDigits: 0,
                })}
              </td>
              <td className="px-2 py-2 text-right text-xs font-mono text-cyan-300">
                {totals.stationUse.toLocaleString("en-BD", {
                  maximumFractionDigits: 0,
                })}
              </td>
              <td className="px-2 py-2 text-right text-xs font-mono font-extrabold text-emerald-300">
                {totals.netGeneration.toLocaleString("en-BD", {
                  maximumFractionDigits: 0,
                })}{" "}
                kWh
              </td>
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer summary bar */}
      <div className="sticky bottom-0 z-20 bg-slate-900/95 backdrop-blur border-t border-slate-700/50 px-6 py-2">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-6 text-slate-400">
            <span>
              Meters:{" "}
              <strong className="text-slate-200">{rows.length}</strong>
            </span>
            <span>
              Gross Generation:{" "}
              <strong className="text-slate-200">
                {(totals.grossGeneration / 1_000_000).toFixed(3)} MWh ×10³
              </strong>
            </span>
            <span>
              Station Use:{" "}
              <strong className="text-amber-300">
                {totals.stationUse > 0
                  ? (
                      (totals.stationUse / totals.grossGeneration) *
                      100
                    ).toFixed(2)
                  : "0.00"}
                %
              </strong>
            </span>
            <span>
              Net Generation:{" "}
              <strong className="text-emerald-400">
                {(totals.netGeneration / 1_000_000).toFixed(3)} MWh ×10³
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <Info className="w-3 h-3" />
            <span>
              Net = (Closing − Opening) × Multiplier − Station Use. All values
              kWh.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
