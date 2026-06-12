"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Settings,
  Zap,
  Wrench,
  XCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  ChevronRight,
  Filter,
  Download,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type OperatingStatus = "running" | "maintenance" | "shutdown";
type FuelType =
  | "Natural Gas"
  | "Coal"
  | "Furnace Oil"
  | "Diesel"
  | "HFO"
  | "Hydro"
  | "Solar";

interface OMFEntry {
  id: string;
  plantId: string;
  omfValue: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  changedBy: string;
  changeReason: string;
}

interface PlantStatus {
  id: string;
  name: string;
  shortCode: string;
  installedCapacity: number; // MW
  availableCapacity: number; // MW
  currentGeneration: number; // MW real-time
  fuelType: FuelType;
  operatingStatus: OperatingStatus;
  omf: number; // %
  cfFactor: number; // %
  auxiliaryPercent: number;
  office: string;
  isCCPP: boolean;
  lastUpdated: string;
  monthlyTarget: number; // MU
  monthlyActual: number; // MU
  outageReason?: string;
  outageStart?: string;
  outageEnd?: string;
  omfHistory: OMFEntry[];
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const INITIAL_PLANTS: PlantStatus[] = [
  {
    id: "p1",
    name: "Ashuganj 225MW",
    shortCode: "ASH",
    installedCapacity: 225,
    availableCapacity: 197,
    currentGeneration: 185,
    fuelType: "Natural Gas",
    operatingStatus: "running",
    omf: 12.5,
    cfFactor: 68.4,
    auxiliaryPercent: 3.2,
    office: "Ashuganj",
    isCCPP: false,
    lastUpdated: "2026-04-06T10:42:00Z",
    monthlyTarget: 120,
    monthlyActual: 108.4,
    omfHistory: [
      {
        id: "h1",
        plantId: "p1",
        omfValue: 12.5,
        effectiveFrom: "2026-04-01",
        effectiveTo: null,
        changedBy: "admin",
        changeReason: "Quarterly review",
      },
      {
        id: "h2",
        plantId: "p1",
        omfValue: 10.0,
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-03-31",
        changedBy: "engineer",
        changeReason: "Post maintenance",
      },
    ],
  },
  {
    id: "p2",
    name: "Payra 1320MW",
    shortCode: "PAY",
    installedCapacity: 1320,
    availableCapacity: 1230,
    currentGeneration: 1180,
    fuelType: "Coal",
    operatingStatus: "running",
    omf: 6.8,
    cfFactor: 80.5,
    auxiliaryPercent: 7.2,
    office: "Khulna",
    isCCPP: false,
    lastUpdated: "2026-04-06T10:41:00Z",
    monthlyTarget: 780,
    monthlyActual: 745.2,
    omfHistory: [],
  },
  {
    id: "p3",
    name: "Haripur 412MW CCPP",
    shortCode: "HAR",
    installedCapacity: 412,
    availableCapacity: 390,
    currentGeneration: 370,
    fuelType: "Natural Gas",
    operatingStatus: "running",
    omf: 5.0,
    cfFactor: 75.3,
    auxiliaryPercent: 2.8,
    office: "Dhaka",
    isCCPP: true,
    lastUpdated: "2026-04-06T10:40:00Z",
    monthlyTarget: 240,
    monthlyActual: 228.7,
    omfHistory: [],
  },
  {
    id: "p4",
    name: "Ghorashal 630MW",
    shortCode: "GHO",
    installedCapacity: 630,
    availableCapacity: 450,
    currentGeneration: 0,
    fuelType: "Natural Gas",
    operatingStatus: "maintenance",
    omf: 28.6,
    cfFactor: 0,
    auxiliaryPercent: 0,
    office: "Dhaka",
    isCCPP: false,
    lastUpdated: "2026-04-05T08:00:00Z",
    monthlyTarget: 370,
    monthlyActual: 142.3,
    outageReason: "Scheduled annual maintenance – GT overhaul",
    outageStart: "2026-04-05T08:00:00Z",
    outageEnd: "2026-04-18T17:00:00Z",
    omfHistory: [],
  },
  {
    id: "p5",
    name: "Barapukuria 525MW",
    shortCode: "BAR",
    installedCapacity: 525,
    availableCapacity: 490,
    currentGeneration: 460,
    fuelType: "Coal",
    operatingStatus: "running",
    omf: 9.5,
    cfFactor: 74.2,
    auxiliaryPercent: 8.1,
    office: "Rajshahi",
    isCCPP: false,
    lastUpdated: "2026-04-06T10:43:00Z",
    monthlyTarget: 310,
    monthlyActual: 297.8,
    omfHistory: [],
  },
  {
    id: "p6",
    name: "Meghnaghat 450MW",
    shortCode: "MEG",
    installedCapacity: 450,
    availableCapacity: 405,
    currentGeneration: 390,
    fuelType: "Natural Gas",
    operatingStatus: "running",
    omf: 10.0,
    cfFactor: 69.8,
    auxiliaryPercent: 3.5,
    office: "Dhaka",
    isCCPP: false,
    lastUpdated: "2026-04-06T10:42:30Z",
    monthlyTarget: 265,
    monthlyActual: 251.6,
    omfHistory: [],
  },
  {
    id: "p7",
    name: "Siddhirgonj 210MW",
    shortCode: "SID",
    installedCapacity: 210,
    availableCapacity: 0,
    currentGeneration: 0,
    fuelType: "Natural Gas",
    operatingStatus: "shutdown",
    omf: 100,
    cfFactor: 0,
    auxiliaryPercent: 0,
    office: "Dhaka",
    isCCPP: false,
    lastUpdated: "2026-04-03T06:15:00Z",
    monthlyTarget: 120,
    monthlyActual: 21.4,
    outageReason: "Gas supply interruption — Titas Gas pipeline fault",
    outageStart: "2026-04-03T06:15:00Z",
    omfHistory: [],
  },
  {
    id: "p8",
    name: "Cumilla 225MW",
    shortCode: "CUM",
    installedCapacity: 225,
    availableCapacity: 198,
    currentGeneration: 180,
    fuelType: "Natural Gas",
    operatingStatus: "running",
    omf: 11.0,
    cfFactor: 65.7,
    auxiliaryPercent: 4.1,
    office: "Cumilla",
    isCCPP: false,
    lastUpdated: "2026-04-06T10:44:00Z",
    monthlyTarget: 130,
    monthlyActual: 124.9,
    omfHistory: [],
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

const STATUS_MAP: Record<
  OperatingStatus,
  {
    label: string;
    icon: React.ReactNode;
    rowCls: string;
    badgeCls: string;
    dotCls: string;
  }
> = {
  running: {
    label: "Running",
    icon: <Activity className="w-3 h-3" />,
    rowCls: "",
    badgeCls:
      "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    dotCls: "bg-emerald-400 animate-pulse",
  },
  maintenance: {
    label: "Maintenance",
    icon: <Wrench className="w-3 h-3" />,
    rowCls: "bg-amber-500/5",
    badgeCls:
      "bg-amber-500/10 border-amber-500/30 text-amber-400",
    dotCls: "bg-amber-400",
  },
  shutdown: {
    label: "Shutdown",
    icon: <XCircle className="w-3 h-3" />,
    rowCls: "bg-red-500/5",
    badgeCls: "bg-red-500/10 border-red-500/30 text-red-400",
    dotCls: "bg-red-500",
  },
};

function StatusBadge({ status }: { status: OperatingStatus }) {
  const cfg = STATUS_MAP[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.badgeCls} uppercase tracking-wider`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotCls}`} />
      {cfg.label}
    </span>
  );
}

function CapacityBar({
  current,
  available,
  installed,
}: {
  current: number;
  available: number;
  installed: number;
}) {
  const usedPct = (current / installed) * 100;
  const availPct = (available / installed) * 100;
  return (
    <div className="w-full">
      <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden relative">
        <div
          className="absolute inset-y-0 left-0 bg-slate-600/40 rounded-full"
          style={{ width: `${availPct}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full transition-all"
          style={{ width: `${usedPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-slate-500 mt-0.5">
        <span>{current} MW</span>
        <span>{installed} MW</span>
      </div>
    </div>
  );
}

function OMFModal({
  plant,
  onClose,
  onUpdate,
}: {
  plant: PlantStatus;
  onClose: () => void;
  onUpdate: (
    plantId: string,
    newOmf: number,
    reason: string
  ) => void;
}) {
  const [newOmf, setNewOmf] = useState(String(plant.omf));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const val = parseFloat(newOmf);
    if (isNaN(val) || val < 0 || val > 100) return;
    if (!reason.trim()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600)); // simulate API
    onUpdate(plant.id, val, reason);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0d1929] border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-bold text-cyan-400">
              Update OMF — {plant.name}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Outage Management Factor (%) — affects net generation calculation
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition-colors"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              Current OMF
            </label>
            <div className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-slate-300">
              {plant.omf}%
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              New OMF Value (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={newOmf}
              onChange={(e) => setNewOmf(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 focus:border-cyan-500 rounded text-xs font-mono text-slate-100 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              Reason for Change
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Enter technical justification..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 focus:border-cyan-500 rounded text-xs text-slate-100 outline-none resize-none"
            />
          </div>
        </div>

        {/* OMF History */}
        {plant.omfHistory.length > 0 && (
          <div className="mt-5">
            <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">
              Change History
            </p>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {plant.omfHistory.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between px-3 py-1.5 bg-slate-800/50 rounded text-[10px]"
                >
                  <span className="text-slate-300 font-mono">{h.omfValue}%</span>
                  <span className="text-slate-500">
                    {h.effectiveFrom} → {h.effectiveTo ?? "present"}
                  </span>
                  <span className="text-slate-600">{h.changedBy}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !reason.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-xs bg-cyan-700 hover:bg-cyan-600 text-white rounded-md transition-colors disabled:opacity-50"
          >
            {saving && <RefreshCw className="w-3 h-3 animate-spin" />}
            Update OMF
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusChangeDropdown({
  plant,
  onChange,
}: {
  plant: PlantStatus;
  onChange: (plantId: string, status: OperatingStatus) => void;
}) {
  const [open, setOpen] = useState(false);

  const statuses: OperatingStatus[] = ["running", "maintenance", "shutdown"];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 text-[10px] border border-slate-700 hover:border-slate-500 rounded bg-slate-800 text-slate-300 transition-colors"
      >
        <Settings className="w-3 h-3" />
        Change
        <ChevronRight
          className={`w-2.5 h-2.5 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 bg-[#0d1929] border border-slate-700 rounded-lg shadow-xl overflow-hidden w-40">
          {statuses.map((s) => {
            const cfg = STATUS_MAP[s];
            return (
              <button
                key={s}
                onClick={() => {
                  onChange(plant.id, s);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800 text-left transition-colors ${
                  plant.operatingStatus === s
                    ? "text-cyan-400 bg-slate-800/60"
                    : "text-slate-300"
                }`}
              >
                {cfg.icon}
                {cfg.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GenerationManagementPage() {
  const [plants, setPlants] = useState<PlantStatus[]>(INITIAL_PLANTS);
  const [filter, setFilter] = useState<"all" | OperatingStatus>("all");
  const [omfModalPlant, setOmfModalPlant] = useState<PlantStatus | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const filtered =
    filter === "all"
      ? plants
      : plants.filter((p) => p.operatingStatus === filter);

  const totalInstalled = plants.reduce(
    (a, p) => a + p.installedCapacity,
    0
  );
  const totalAvailable = plants.reduce(
    (a, p) => a + p.availableCapacity,
    0
  );
  const totalGeneration = plants.reduce(
    (a, p) => a + p.currentGeneration,
    0
  );
  const running = plants.filter((p) => p.operatingStatus === "running").length;
  const maintenance = plants.filter(
    (p) => p.operatingStatus === "maintenance"
  ).length;
  const shutdown = plants.filter(
    (p) => p.operatingStatus === "shutdown"
  ).length;

  function handleStatusChange(plantId: string, status: OperatingStatus) {
    setPlants((prev) =>
      prev.map((p) =>
        p.id === plantId
          ? {
              ...p,
              operatingStatus: status,
              currentGeneration:
                status !== "running" ? 0 : p.currentGeneration,
              availableCapacity:
                status === "shutdown" ? 0 : p.availableCapacity,
              lastUpdated: new Date().toISOString(),
            }
          : p
      )
    );
  }

  function handleOmfUpdate(
    plantId: string,
    newOmf: number,
    reason: string
  ) {
    setPlants((prev) =>
      prev.map((p) => {
        if (p.id !== plantId) return p;
        const newEntry: OMFEntry = {
          id: `h_${Date.now()}`,
          plantId,
          omfValue: newOmf,
          effectiveFrom: new Date().toISOString().split("T")[0],
          effectiveTo: null,
          changedBy: "admin",
          changeReason: reason,
        };
        return {
          ...p,
          omf: newOmf,
          omfHistory: [newEntry, ...p.omfHistory],
          lastUpdated: new Date().toISOString(),
        };
      })
    );
  }

  function handleRefresh() {
    setLastRefresh(new Date());
  }

  return (
    <div className="min-h-screen bg-[#070d1a] text-slate-100 font-['IBM_Plex_Mono',monospace]">
      {omfModalPlant && (
        <OMFModal
          plant={omfModalPlant}
          onClose={() => setOmfModalPlant(null)}
          onUpdate={handleOmfUpdate}
        />
      )}

      {/* Header */}
      <div className="border-b border-slate-800/60 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-cyan-400 tracking-tight">
              Generation Management
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              System Resource Monitor — Active Power Plants &amp; OMF Control
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-600">
              Last refresh:{" "}
              {lastRefresh.toLocaleTimeString("en-BD", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-700 hover:border-slate-500 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-700 hover:border-slate-500 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors">
              <Download className="w-3 h-3" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-4">
        {[
          {
            label: "Installed Capacity",
            value: `${totalInstalled.toLocaleString()} MW`,
            sub: "Total BPDB fleet",
            icon: <Zap className="w-4 h-4 text-cyan-400" />,
            color: "border-cyan-800/40",
          },
          {
            label: "Available Capacity",
            value: `${totalAvailable.toLocaleString()} MW`,
            sub: `${((totalAvailable / totalInstalled) * 100).toFixed(1)}% of installed`,
            icon: <CheckCircle className="w-4 h-4 text-emerald-400" />,
            color: "border-emerald-800/40",
          },
          {
            label: "Current Generation",
            value: `${totalGeneration.toLocaleString()} MW`,
            sub: `${((totalGeneration / totalInstalled) * 100).toFixed(1)}% utilisation`,
            icon: <Activity className="w-4 h-4 text-blue-400" />,
            color: "border-blue-800/40",
          },
          {
            label: "Plant Status",
            value: `${running} / ${plants.length}`,
            sub: `${maintenance} maintenance · ${shutdown} shutdown`,
            icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
            color: "border-amber-800/40",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`bg-slate-900/60 border ${kpi.color} rounded-xl px-4 py-3`}
          >
            <div className="flex items-center justify-between mb-2">
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

      {/* Filter tabs */}
      <div className="flex items-center gap-2 px-6 pb-3">
        {(["all", "running", "maintenance", "shutdown"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              filter === f
                ? "bg-cyan-600 border-cyan-500 text-white"
                : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
            }`}
          >
            {f === "all" ? `All (${plants.length})` : null}
            {f === "running" ? `Running (${running})` : null}
            {f === "maintenance" ? `Maintenance (${maintenance})` : null}
            {f === "shutdown" ? `Shutdown (${shutdown})` : null}
          </button>
        ))}
      </div>

      {/* Plants table */}
      <div className="px-6 pb-6 overflow-x-auto">
        <table className="w-full text-[11px] border-collapse min-w-[1200px]">
          <thead>
            <tr className="text-slate-500 uppercase tracking-wider">
              {[
                ["Plant", "left", "min-w-[180px]"],
                ["Status", "center", "min-w-[110px]"],
                ["Capacity (MW)", "right", "min-w-[120px]"],
                ["Current Gen.", "right", "min-w-[120px]"],
                ["Fuel", "center", "min-w-[100px]"],
                ["OMF %", "right", "min-w-[80px]"],
                ["CF %", "right", "min-w-[70px]"],
                ["Aux. %", "right", "min-w-[70px]"],
                ["Monthly Progress", "center", "min-w-[150px]"],
                ["Office", "center", "min-w-[90px]"],
                ["Actions", "center", "min-w-[160px]"],
              ].map(([label, align, minW]) => (
                <th
                  key={label as string}
                  className={`px-3 py-2 text-${align as string} font-semibold bg-slate-900/80 border-b border-slate-700/60 ${minW}`}
                >
                  {label as string}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((plant, idx) => {
              const cfg = STATUS_MAP[plant.operatingStatus];
              const progressPct = Math.min(
                100,
                (plant.monthlyActual / plant.monthlyTarget) * 100
              );
              const isBehind = progressPct < 70;

              return (
                <tr
                  key={plant.id}
                  className={`${cfg.rowCls} ${idx % 2 === 0 ? "bg-slate-900/10" : ""} border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors`}
                >
                  {/* Plant name */}
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-100">
                        {plant.name}
                        {plant.isCCPP && (
                          <span className="ml-1 text-[9px] px-1 py-0.5 bg-purple-500/20 text-purple-400 rounded border border-purple-500/30">
                            CCPP
                          </span>
                        )}
                      </span>
                      <span className="text-slate-600 text-[9px]">
                        {plant.shortCode} ·{" "}
                        {new Date(plant.lastUpdated).toLocaleTimeString(
                          "en-BD",
                          { hour: "2-digit", minute: "2-digit" }
                        )}
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <StatusBadge status={plant.operatingStatus} />
                      {plant.outageReason && (
                        <span
                          className="text-[9px] text-slate-500 max-w-[100px] truncate"
                          title={plant.outageReason}
                        >
                          {plant.outageReason}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Capacity */}
                  <td className="px-3 py-2">
                    <CapacityBar
                      current={plant.currentGeneration}
                      available={plant.availableCapacity}
                      installed={plant.installedCapacity}
                    />
                  </td>

                  {/* Current gen */}
                  <td className="px-3 py-2 text-right font-mono">
                    <span
                      className={
                        plant.currentGeneration === 0
                          ? "text-slate-600"
                          : "text-slate-200"
                      }
                    >
                      {plant.currentGeneration.toLocaleString()} MW
                    </span>
                  </td>

                  {/* Fuel */}
                  <td className="px-3 py-2 text-center">
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] text-slate-300">
                      {plant.fuelType}
                    </span>
                  </td>

                  {/* OMF */}
                  <td className="px-3 py-2 text-right font-mono">
                    <span
                      className={
                        plant.omf > 20
                          ? "text-red-400"
                          : plant.omf > 10
                            ? "text-amber-400"
                            : "text-slate-300"
                      }
                    >
                      {plant.omf.toFixed(1)}%
                    </span>
                  </td>

                  {/* CF */}
                  <td className="px-3 py-2 text-right font-mono text-slate-300">
                    {plant.cfFactor.toFixed(1)}%
                  </td>

                  {/* Aux */}
                  <td className="px-3 py-2 text-right font-mono">
                    <span
                      className={
                        plant.auxiliaryPercent > 8
                          ? "text-amber-400"
                          : "text-slate-300"
                      }
                    >
                      {plant.auxiliaryPercent.toFixed(1)}%
                    </span>
                  </td>

                  {/* Monthly progress */}
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px]">
                        <span className="text-slate-500">
                          {plant.monthlyActual} / {plant.monthlyTarget} MU
                        </span>
                        <span
                          className={
                            isBehind ? "text-amber-400" : "text-emerald-400"
                          }
                        >
                          {progressPct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isBehind ? "bg-amber-500" : "bg-emerald-500"}`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Office */}
                  <td className="px-3 py-2 text-center text-slate-400 text-[10px]">
                    {plant.office}
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-2">
                      <StatusChangeDropdown
                        plant={plant}
                        onChange={handleStatusChange}
                      />
                      <button
                        onClick={() => setOmfModalPlant(plant)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] border border-cyan-800/50 hover:border-cyan-500/50 bg-cyan-900/20 hover:bg-cyan-900/40 text-cyan-400 rounded transition-colors"
                      >
                        <Settings className="w-3 h-3" />
                        OMF
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
