"use client";

import React, { useState } from "react";
import {
  Building2,
  TrendingUp,
  TrendingDown,
  Download,
  RefreshCw,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  Info,
  BarChart3,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeliveryPoint {
  id: string;
  name: string;
  voltageLevel: string;
  circuitId: string;
  region: string;
}

interface UtilityMonthData {
  peakDemand: number; // MW
  allocatedEnergy: number; // MWh
  deliveredEnergy: number; // MWh
  reactivePower: number; // MVArh
  powerFactor: number;
  scheduledDowntime: number; // hours
  deliveryPoints: DeliveryPoint[];
  prevMonthDelivered?: number; // for trend
}

interface Utility {
  id: string;
  shortName: string;
  fullName: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  region: string;
  data: UtilityMonthData;
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const UTILITIES: Utility[] = [
  {
    id: "dpdc",
    shortName: "DPDC",
    fullName: "Dhaka Power Distribution Company Ltd.",
    color: "cyan",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/30",
    textColor: "text-cyan-400",
    region: "Dhaka North",
    data: {
      peakDemand: 1842.5,
      allocatedEnergy: 1125000,
      deliveredEnergy: 1098400,
      reactivePower: 214520,
      powerFactor: 0.91,
      scheduledDowntime: 24,
      prevMonthDelivered: 1072000,
      deliveryPoints: [
        {
          id: "dp1",
          name: "Aminbazar 132kV",
          voltageLevel: "132KV",
          circuitId: "DPDC-132-AMN",
          region: "Dhaka North",
        },
        {
          id: "dp2",
          name: "Haripur 132kV Feeder A",
          voltageLevel: "132KV",
          circuitId: "DPDC-132-HAR-A",
          region: "Dhaka North",
        },
        {
          id: "dp3",
          name: "Tongi 33kV",
          voltageLevel: "33KV",
          circuitId: "DPDC-33-TNG",
          region: "Gazipur",
        },
      ],
    },
  },
  {
    id: "desco",
    shortName: "DESCO",
    fullName: "Dhaka Electric Supply Company Ltd.",
    color: "blue",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    textColor: "text-blue-400",
    region: "Dhaka North",
    data: {
      peakDemand: 1204.0,
      allocatedEnergy: 735000,
      deliveredEnergy: 718600,
      reactivePower: 142100,
      powerFactor: 0.88,
      scheduledDowntime: 12,
      prevMonthDelivered: 730000,
      deliveryPoints: [
        {
          id: "dp4",
          name: "Mirpur 132kV",
          voltageLevel: "132KV",
          circuitId: "DESCO-132-MIR",
          region: "Mirpur",
        },
        {
          id: "dp5",
          name: "Uttara 132kV",
          voltageLevel: "132KV",
          circuitId: "DESCO-132-UTT",
          region: "Uttara",
        },
      ],
    },
  },
  {
    id: "wzpdco",
    shortName: "WZPDCO",
    fullName: "West Zone Power Distribution Company Ltd.",
    color: "emerald",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    textColor: "text-emerald-400",
    region: "Khulna / West",
    data: {
      peakDemand: 980.0,
      allocatedEnergy: 598000,
      deliveredEnergy: 581200,
      reactivePower: 115800,
      powerFactor: 0.89,
      scheduledDowntime: 36,
      prevMonthDelivered: 560000,
      deliveryPoints: [
        {
          id: "dp6",
          name: "Khulna 132kV",
          voltageLevel: "132KV",
          circuitId: "WZP-132-KHL",
          region: "Khulna",
        },
        {
          id: "dp7",
          name: "Jessore 132kV",
          voltageLevel: "132KV",
          circuitId: "WZP-132-JSS",
          region: "Jessore",
        },
        {
          id: "dp8",
          name: "Payra 400kV Bus",
          voltageLevel: "400KV",
          circuitId: "WZP-400-PAY",
          region: "Patuakhali",
        },
      ],
    },
  },
  {
    id: "nesco",
    shortName: "NESCO",
    fullName: "Northern Electric Supply Company Ltd.",
    color: "violet",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
    textColor: "text-violet-400",
    region: "Rajshahi / North",
    data: {
      peakDemand: 640.5,
      allocatedEnergy: 390000,
      deliveredEnergy: 381400,
      reactivePower: 78200,
      powerFactor: 0.87,
      scheduledDowntime: 18,
      prevMonthDelivered: 370000,
      deliveryPoints: [
        {
          id: "dp9",
          name: "Rajshahi 132kV",
          voltageLevel: "132KV",
          circuitId: "NSC-132-RAJ",
          region: "Rajshahi",
        },
        {
          id: "dp10",
          name: "Bogura 132kV",
          voltageLevel: "132KV",
          circuitId: "NSC-132-BOG",
          region: "Bogura",
        },
      ],
    },
  },
  {
    id: "breb",
    shortName: "BREB",
    fullName: "Bangladesh Rural Electrification Board",
    color: "amber",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    textColor: "text-amber-400",
    region: "National Rural",
    data: {
      peakDemand: 3120.0,
      allocatedEnergy: 1905000,
      deliveredEnergy: 1872000,
      reactivePower: 376400,
      powerFactor: 0.92,
      scheduledDowntime: 60,
      prevMonthDelivered: 1845000,
      deliveryPoints: [
        {
          id: "dp11",
          name: "Comilla 132kV",
          voltageLevel: "132KV",
          circuitId: "BREB-132-COM",
          region: "Comilla",
        },
        {
          id: "dp12",
          name: "Faridpur 132kV",
          voltageLevel: "132KV",
          circuitId: "BREB-132-FAR",
          region: "Faridpur",
        },
        {
          id: "dp13",
          name: "Sylhet 132kV",
          voltageLevel: "132KV",
          circuitId: "BREB-132-SYL",
          region: "Sylhet",
        },
        {
          id: "dp14",
          name: "Mymensingh 132kV",
          voltageLevel: "132KV",
          circuitId: "BREB-132-MYM",
          region: "Mymensingh",
        },
      ],
    },
  },
  {
    id: "bpdb_dist",
    shortName: "BPDB Dist.",
    fullName: "BPDB Direct Distribution Division",
    color: "rose",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    textColor: "text-rose-400",
    region: "Chittagong / Mixed",
    data: {
      peakDemand: 895.0,
      allocatedEnergy: 546000,
      deliveredEnergy: 532800,
      reactivePower: 107100,
      powerFactor: 0.90,
      scheduledDowntime: 30,
      prevMonthDelivered: 512000,
      deliveryPoints: [
        {
          id: "dp15",
          name: "Chittagong 132kV",
          voltageLevel: "132KV",
          circuitId: "BPDB-132-CTG",
          region: "Chittagong",
        },
        {
          id: "dp16",
          name: "Barishal 132kV",
          voltageLevel: "132KV",
          circuitId: "BPDB-132-BAR",
          region: "Barishal",
        },
        {
          id: "dp17",
          name: "Noakhali 33kV",
          voltageLevel: "33KV",
          circuitId: "BPDB-33-NOA",
          region: "Noakhali",
        },
      ],
    },
  },
];

type SortKey =
  | "peakDemand"
  | "allocatedEnergy"
  | "deliveredEnergy"
  | "powerFactor";

// ─── Sub-components ───────────────────────────────────────────────────────────

function DeliveryBar({
  allocated,
  delivered,
}: {
  allocated: number;
  delivered: number;
}) {
  const pct = Math.min(100, (delivered / allocated) * 100);
  const under = pct < 90;
  return (
    <div className="w-full">
      <div className="flex justify-between text-[9px] mb-0.5">
        <span className="text-slate-500">
          {(delivered / 1000).toFixed(1)} GWh
        </span>
        <span className={under ? "text-amber-400" : "text-emerald-400"}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${under ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TrendChip({ current, prev }: { current: number; prev?: number }) {
  if (!prev) return <span className="text-slate-600 text-[9px]">—</span>;
  const diff = ((current - prev) / prev) * 100;
  const up = diff >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[9px] font-mono ${up ? "text-emerald-400" : "text-red-400"}`}
    >
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {Math.abs(diff).toFixed(1)}%
    </span>
  );
}

function ExpandedRow({ utility }: { utility: Utility }) {
  return (
    <tr className={`${utility.bgColor}`}>
      <td colSpan={10} className="px-6 py-3">
        <div className="flex items-start gap-6">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
              Delivery Points ({utility.data.deliveryPoints.length})
            </p>
            <div className="grid grid-cols-2 gap-2">
              {utility.data.deliveryPoints.map((dp) => (
                <div
                  key={dp.id}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 border border-slate-700/40 rounded text-[10px]"
                >
                  <span
                    className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                      dp.voltageLevel === "400KV"
                        ? "bg-red-900/50 text-red-400 border border-red-700/30"
                        : dp.voltageLevel === "132KV"
                          ? "bg-amber-900/50 text-amber-400 border border-amber-700/30"
                          : "bg-slate-700 text-slate-400 border border-slate-600"
                    }`}
                  >
                    {dp.voltageLevel}
                  </span>
                  <div>
                    <p className="text-slate-200">{dp.name}</p>
                    <p className="text-slate-600">{dp.circuitId}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
              Reactive Power
            </p>
            <p className="font-mono text-slate-200 text-sm">
              {(utility.data.reactivePower / 1000).toFixed(1)} GVArh
            </p>
            <p className="text-[10px] text-slate-500 mt-2">
              Scheduled Downtime
            </p>
            <p className="font-mono text-slate-200">
              {utility.data.scheduledDowntime} hrs
            </p>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UtilitySalesPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("deliveredEnergy");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedMonth, setSelectedMonth] = useState("2026-04");

  const totals = UTILITIES.reduce(
    (a, u) => ({
      peakDemand: a.peakDemand + u.data.peakDemand,
      allocatedEnergy: a.allocatedEnergy + u.data.allocatedEnergy,
      deliveredEnergy: a.deliveredEnergy + u.data.deliveredEnergy,
      reactivePower: a.reactivePower + u.data.reactivePower,
    }),
    {
      peakDemand: 0,
      allocatedEnergy: 0,
      deliveredEnergy: 0,
      reactivePower: 0,
    }
  );

  const sorted = [...UTILITIES].sort((a, b) => {
    const av = a.data[sortKey] as number;
    const bv = b.data[sortKey] as number;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) =>
    col !== sortKey ? null : sortDir === "desc" ? (
      <ChevronDown className="w-3 h-3 ml-0.5 inline" />
    ) : (
      <ChevronUp className="w-3 h-3 ml-0.5 inline" />
    );

  const deliveryPct =
    (totals.deliveredEnergy / totals.allocatedEnergy) * 100;

  return (
    <div className="min-h-screen bg-[#070d1a] text-slate-100 font-['IBM_Plex_Mono',monospace]">
      {/* Header */}
      <div className="border-b border-slate-800/60 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-cyan-400 tracking-tight">
              Utility Sales — Bulk Distribution Delivery
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Grid supply delivery points mapped to 6 bulk distribution utilities
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded text-slate-200 outline-none focus:border-cyan-500"
            >
              <option value="2026-04">April 2026</option>
              <option value="2026-03">March 2026</option>
              <option value="2026-02">February 2026</option>
            </select>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-700 hover:border-slate-500 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors">
              <Download className="w-3 h-3" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI bar */}
      <div className="grid grid-cols-4 gap-3 px-6 py-4">
        {[
          {
            label: "System Peak Demand",
            value: `${totals.peakDemand.toLocaleString()} MW`,
            icon: <BarChart3 className="w-4 h-4 text-cyan-400" />,
          },
          {
            label: "Allocated Energy",
            value: `${(totals.allocatedEnergy / 1000).toFixed(1)} GWh`,
            icon: <Building2 className="w-4 h-4 text-blue-400" />,
          },
          {
            label: "Delivered Energy",
            value: `${(totals.deliveredEnergy / 1000).toFixed(1)} GWh`,
            icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
          },
          {
            label: "Delivery Achievement",
            value: `${deliveryPct.toFixed(2)}%`,
            icon:
              deliveryPct < 95 ? (
                <AlertCircle className="w-4 h-4 text-amber-400" />
              ) : (
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              ),
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-slate-900/60 border border-slate-700/40 rounded-xl px-4 py-3"
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
          </div>
        ))}
      </div>

      {/* Distribution bar chart */}
      <div className="px-6 pb-4">
        <div className="bg-slate-900/40 border border-slate-700/40 rounded-xl px-4 py-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">
            Energy Delivery Share — April 2026
          </p>
          <div className="flex items-end gap-2 h-20">
            {UTILITIES.map((u) => {
              const pct = (u.data.deliveredEnergy / totals.deliveredEnergy) * 100;
              return (
                <div key={u.id} className="flex flex-col items-center flex-1 gap-1">
                  <span className="text-[9px] text-slate-400 font-mono">
                    {pct.toFixed(1)}%
                  </span>
                  <div
                    className={`w-full rounded-t-sm transition-all ${u.bgColor} border ${u.borderColor}`}
                    style={{ height: `${Math.max(6, pct * 1.8)}px` }}
                  />
                  <span className={`text-[9px] font-bold ${u.textColor}`}>
                    {u.shortName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main table */}
      <div className="px-6 pb-6 overflow-x-auto">
        <table className="w-full text-[11px] border-collapse min-w-[1100px]">
          <thead>
            <tr className="text-slate-500 uppercase tracking-wider">
              <th className="px-3 py-2 text-left font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[180px]">
                Utility
              </th>
              <th className="px-3 py-2 text-left font-semibold bg-slate-900/80 border-b border-slate-700/60">
                Region
              </th>
              <th
                className="px-3 py-2 text-right font-semibold bg-slate-900/80 border-b border-slate-700/60 cursor-pointer hover:text-slate-200 min-w-[110px]"
                onClick={() => handleSort("peakDemand")}
              >
                Peak Demand (MW)
                <SortIcon col="peakDemand" />
              </th>
              <th
                className="px-3 py-2 text-right font-semibold bg-slate-900/80 border-b border-slate-700/60 cursor-pointer hover:text-slate-200 min-w-[130px]"
                onClick={() => handleSort("allocatedEnergy")}
              >
                Allocated (MWh)
                <SortIcon col="allocatedEnergy" />
              </th>
              <th
                className="px-3 py-2 text-right font-semibold bg-slate-900/80 border-b border-slate-700/60 cursor-pointer hover:text-slate-200 min-w-[130px]"
                onClick={() => handleSort("deliveredEnergy")}
              >
                Delivered (MWh)
                <SortIcon col="deliveredEnergy" />
              </th>
              <th className="px-3 py-2 text-center font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[180px]">
                Delivery Achievement
              </th>
              <th
                className="px-3 py-2 text-right font-semibold bg-slate-900/80 border-b border-slate-700/60 cursor-pointer hover:text-slate-200 min-w-[90px]"
                onClick={() => handleSort("powerFactor")}
              >
                Power Factor
                <SortIcon col="powerFactor" />
              </th>
              <th className="px-3 py-2 text-center font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[80px]">
                MoM Trend
              </th>
              <th className="px-3 py-2 text-center font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[80px]">
                Points
              </th>
              <th className="px-3 py-2 text-center font-semibold bg-slate-900/80 border-b border-slate-700/60 min-w-[60px]" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((utility, idx) => {
              const isExpanded = expandedId === utility.id;
              const allocPct =
                (utility.data.deliveredEnergy / utility.data.allocatedEnergy) * 100;

              return (
                <React.Fragment key={utility.id}>
                  <tr
                    className={`border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors ${idx % 2 === 0 ? "bg-slate-900/10" : ""}`}
                  >
                    {/* Utility name */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-6 rounded-full ${utility.bgColor} border ${utility.borderColor}`}
                        />
                        <div>
                          <p
                            className={`font-bold text-xs ${utility.textColor}`}
                          >
                            {utility.shortName}
                          </p>
                          <p className="text-[9px] text-slate-600 leading-tight max-w-[140px] truncate">
                            {utility.fullName}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Region */}
                    <td className="px-3 py-2 text-slate-400 text-[10px]">
                      {utility.region}
                    </td>

                    {/* Peak demand */}
                    <td className="px-3 py-2 text-right font-mono text-slate-200">
                      {utility.data.peakDemand.toLocaleString("en-BD", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                    </td>

                    {/* Allocated */}
                    <td className="px-3 py-2 text-right font-mono text-slate-300">
                      {utility.data.allocatedEnergy.toLocaleString()}
                    </td>

                    {/* Delivered */}
                    <td className="px-3 py-2 text-right font-mono font-semibold text-slate-100">
                      {utility.data.deliveredEnergy.toLocaleString()}
                    </td>

                    {/* Achievement bar */}
                    <td className="px-3 py-2">
                      <DeliveryBar
                        allocated={utility.data.allocatedEnergy}
                        delivered={utility.data.deliveredEnergy}
                      />
                    </td>

                    {/* Power factor */}
                    <td className="px-3 py-2 text-right font-mono">
                      <span
                        className={
                          utility.data.powerFactor < 0.85
                            ? "text-red-400"
                            : utility.data.powerFactor < 0.90
                              ? "text-amber-400"
                              : "text-emerald-400"
                        }
                      >
                        {utility.data.powerFactor.toFixed(2)}
                      </span>
                    </td>

                    {/* Trend */}
                    <td className="px-3 py-2 text-center">
                      <TrendChip
                        current={utility.data.deliveredEnergy}
                        prev={utility.data.prevMonthDelivered}
                      />
                    </td>

                    {/* Delivery points count */}
                    <td className="px-3 py-2 text-center">
                      <span className="text-xs font-mono text-slate-400">
                        {utility.data.deliveryPoints.length}
                      </span>
                    </td>

                    {/* Expand toggle */}
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() =>
                          setExpandedId(isExpanded ? null : utility.id)
                        }
                        className="p-1 text-slate-500 hover:text-slate-200 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>

                  {isExpanded && <ExpandedRow utility={utility} />}
                </React.Fragment>
              );
            })}

            {/* Totals */}
            <tr className="bg-slate-800/40 border-t-2 border-slate-600/40 font-bold">
              <td className="px-3 py-2 text-xs text-cyan-400 uppercase tracking-wider">
                SYSTEM TOTAL
              </td>
              <td className="px-3 py-2 text-slate-500 text-[10px]">
                All Utilities
              </td>
              <td className="px-3 py-2 text-right font-mono text-cyan-300">
                {totals.peakDemand.toLocaleString("en-BD", {
                  minimumFractionDigits: 1,
                })}
              </td>
              <td className="px-3 py-2 text-right font-mono text-cyan-300">
                {totals.allocatedEnergy.toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right font-mono text-cyan-300">
                {totals.deliveredEnergy.toLocaleString()}
              </td>
              <td className="px-3 py-2">
                <DeliveryBar
                  allocated={totals.allocatedEnergy}
                  delivered={totals.deliveredEnergy}
                />
              </td>
              <td className="px-3 py-2 text-right font-mono text-slate-400">
                —
              </td>
              <td colSpan={3} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="px-6 pb-6">
        <div className="flex items-center gap-2 text-[10px] text-slate-600">
          <Info className="w-3 h-3" />
          All energy figures in MWh unless stated. Peak demand in MW (monthly
          system peak). Power factor threshold: 0.85 minimum per BPDB contract
          schedule.
        </div>
      </div>
    </div>
  );
}
