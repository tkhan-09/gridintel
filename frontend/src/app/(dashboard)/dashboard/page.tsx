"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart,
  Area,
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
  Zap,
  ArrowDownToLine,
  Battery,
  DollarSign,
  AlertTriangle,
  TrendingDown,
  Lock,
  Unlock,
  Bot,
  RefreshCw,
  ChevronRight,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardKPIs {
  total_generation_mwh: number;
  cross_border_import_mwh: number;
  total_available_energy_mwh: number;
  total_utility_sales_mwh: number;
  system_loss_kwh: number;
  system_loss_percent: number;
  generation_trend: number; // % change vs last month
  import_trend: number;
  sales_trend: number;
  loss_trend: number;
}

interface TrendPoint {
  month: string;
  generation: number;
  losses: number;
  sales: number;
}

interface TopPlant {
  rank: number;
  name: string;
  capacity_mw: number;
  generation_mwh: number;
  efficiency_percent: number;
  plant_factor: number;
  fuel_type: string;
}

interface UtilitySale {
  utility: string;
  sales_mwh: number;
  sales_percent: number;
  revenue_bdt: number;
  tariff_per_kwh: number;
}

interface EnergyFlowBlock {
  label: string;
  value_mwh: number;
  color: string;
  width_percent: number;
}

interface DashboardData {
  kpis: DashboardKPIs;
  trend_data: TrendPoint[];
  top_plants: TopPlant[];
  utility_sales: UtilitySale[];
  active_anomaly_count: number;
  locked_months: string[];
}

// ─── Mock Data (replace with real API) ───────────────────────────────────────

const MOCK_DASHBOARD: DashboardData = {
  kpis: {
    total_generation_mwh: 4218650,
    cross_border_import_mwh: 387420,
    total_available_energy_mwh: 4606070,
    total_utility_sales_mwh: 3891240,
    system_loss_kwh: 714830000,
    system_loss_percent: 15.52,
    generation_trend: 3.2,
    import_trend: -1.8,
    sales_trend: 4.1,
    loss_trend: -0.6,
  },
  trend_data: [
    { month: "May-25", generation: 3820, losses: 598, sales: 3210 },
    { month: "Jun-25", generation: 3950, losses: 612, sales: 3330 },
    { month: "Jul-25", generation: 4100, losses: 634, sales: 3460 },
    { month: "Aug-25", generation: 4080, losses: 629, sales: 3445 },
    { month: "Sep-25", generation: 3920, losses: 605, sales: 3310 },
    { month: "Oct-25", generation: 3760, losses: 581, sales: 3175 },
    { month: "Nov-25", generation: 3640, losses: 560, sales: 3080 },
    { month: "Dec-25", generation: 3510, losses: 543, sales: 2965 },
    { month: "Jan-26", generation: 3680, losses: 569, sales: 3108 },
    { month: "Feb-26", generation: 3790, losses: 585, sales: 3202 },
    { month: "Mar-26", generation: 3990, losses: 617, sales: 3370 },
    { month: "Apr-26", generation: 4219, losses: 715, sales: 3891 },
  ],
  top_plants: [
    { rank: 1, name: "Payra 1320MW", capacity_mw: 1320, generation_mwh: 872400, efficiency_percent: 74.8, plant_factor: 0.748, fuel_type: "Coal" },
    { rank: 2, name: "Haripur 412MW CCPP", capacity_mw: 412, generation_mwh: 261840, efficiency_percent: 72.4, plant_factor: 0.724, fuel_type: "Gas" },
    { rank: 3, name: "Ghorashal 630MW", capacity_mw: 630, generation_mwh: 374220, efficiency_percent: 67.9, plant_factor: 0.679, fuel_type: "Gas" },
    { rank: 4, name: "Barapukuria 525MW", capacity_mw: 525, generation_mwh: 302400, efficiency_percent: 65.6, plant_factor: 0.656, fuel_type: "Coal" },
    { rank: 5, name: "Meghnaghat 450MW", capacity_mw: 450, generation_mwh: 248400, efficiency_percent: 62.9, plant_factor: 0.629, fuel_type: "Gas" },
  ],
  utility_sales: [
    { utility: "BPDB", sales_mwh: 1245600, sales_percent: 32.0, revenue_bdt: 870540000, tariff_per_kwh: 6.99 },
    { utility: "DPDC", sales_mwh: 934200, sales_percent: 24.0, revenue_bdt: 654540000, tariff_per_kwh: 7.01 },
    { utility: "DESCO", sales_mwh: 700950, sales_percent: 18.0, revenue_bdt: 491665000, tariff_per_kwh: 7.02 },
    { utility: "PBS", sales_mwh: 545724, sales_percent: 14.0, revenue_bdt: 381007000, tariff_per_kwh: 6.98 },
    { utility: "NESCO", sales_mwh: 272862, sales_percent: 7.0, revenue_bdt: 190366000, tariff_per_kwh: 6.98 },
    { utility: "WZPDCL", sales_mwh: 192654, sales_percent: 5.0, revenue_bdt: 134058000, tariff_per_kwh: 6.96 },
  ],
  active_anomaly_count: 3,
  locked_months: ["Jan-26", "Feb-26", "Mar-26"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMWh(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M MWh`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K MWh`;
  return `${val.toFixed(0)} MWh`;
}

function formatKWh(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B KWh`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M KWh`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K KWh`;
  return `${val.toFixed(0)} KWh`;
}

function formatBDT(val: number): string {
  if (val >= 1_000_000_000) return `৳${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `৳${(val / 1_000_000).toFixed(1)}M`;
  return `৳${(val / 1_000).toFixed(0)}K`;
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

interface MetricCardProps {
  title: string;
  value: string;
  trend?: number;
  icon: React.ReactNode;
  accent: string;
  subtitle?: string;
}

function MetricCard({ title, value, trend, icon, accent, subtitle }: MetricCardProps) {
  const trendPositive = trend !== undefined && trend >= 0;
  const trendAbs = trend !== undefined ? Math.abs(trend).toFixed(1) : null;

  return (
    <div className="relative overflow-hidden rounded-xl bg-[#0f172a] border border-[#1e293b] p-5 flex flex-col gap-3 hover:border-[#334155] transition-colors group">
      {/* Accent glow */}
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 blur-2xl group-hover:opacity-20 transition-opacity"
        style={{ background: accent }}
      />
      <div className="flex items-start justify-between">
        <div
          className="p-2 rounded-lg"
          style={{ background: `${accent}20`, border: `1px solid ${accent}40` }}
        >
          <div style={{ color: accent }}>{icon}</div>
        </div>
        {trendAbs !== null && (
          <div
            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
              trendPositive
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-rose-500/10 text-rose-400"
            }`}
          >
            {trendPositive ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {trendAbs}%
          </div>
        )}
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-100 font-mono">{value}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

// Energy Flow Block Visual
function EnergyFlowDiagram({ kpis }: { kpis: DashboardKPIs }) {
  const total = kpis.total_available_energy_mwh;
  const blocks: { label: string; value: number; color: string; pct: number }[] = [
    {
      label: "Generation",
      value: kpis.total_generation_mwh,
      color: "#3b82f6",
      pct: (kpis.total_generation_mwh / total) * 100,
    },
    {
      label: "Import",
      value: kpis.cross_border_import_mwh,
      color: "#8b5cf6",
      pct: (kpis.cross_border_import_mwh / total) * 100,
    },
  ];

  const outputs: { label: string; value: number; color: string; pct: number }[] = [
    {
      label: "Utility Sales",
      value: kpis.total_utility_sales_mwh,
      color: "#10b981",
      pct: (kpis.total_utility_sales_mwh / total) * 100,
    },
    {
      label: "System Loss",
      value: kpis.system_loss_kwh / 1000,
      color: "#ef4444",
      pct: kpis.system_loss_percent,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Input row */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Energy Inputs</p>
        <div className="flex gap-1 h-10 rounded-lg overflow-hidden">
          {blocks.map((b) => (
            <div
              key={b.label}
              className="flex items-center justify-center text-xs font-semibold text-white relative"
              style={{ width: `${b.pct}%`, background: b.color }}
            >
              <span className="truncate px-2">
                {b.label} {b.pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          {blocks.map((b) => (
            <p key={b.label} className="text-xs text-slate-400">
              <span style={{ color: b.color }}>●</span>{" "}
              {formatMWh(b.value)}
            </p>
          ))}
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-center gap-2 px-2">
        <div className="flex-1 h-px bg-slate-700" />
        <div className="text-slate-500 text-xs font-mono">
          Total Available: {formatMWh(total)}
        </div>
        <div className="flex-1 h-px bg-slate-700" />
      </div>

      {/* Output row */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Energy Outputs</p>
        <div className="flex gap-1 h-10 rounded-lg overflow-hidden">
          {outputs.map((b) => (
            <div
              key={b.label}
              className="flex items-center justify-center text-xs font-semibold text-white"
              style={{ width: `${b.pct}%`, background: b.color }}
            >
              <span className="truncate px-2">
                {b.label} {b.pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          {outputs.map((b) => (
            <p key={b.label} className="text-xs text-slate-400">
              <span style={{ color: b.color }}>●</span>{" "}
              {formatMWh(b.value)}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// Custom Tooltip for Recharts
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f172a] border border-[#334155] rounded-lg p-3 shadow-xl text-xs">
      <p className="text-slate-300 font-semibold mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="text-slate-100 font-mono">{p.value.toFixed(0)} GWh</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      const res = await apiClient.get(`/analytics/dashboard?month=${month}&year=${year}`);
      setData(res.data);
    } catch {
      setData(MOCK_DASHBOARD);
    } finally {
      setLoading(false);
      setLastUpdated(new Date());
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-[#080f1e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Activity className="w-10 h-10 text-blue-400 animate-pulse" />
          <p className="text-slate-400 text-sm">Loading GridIntel Dashboard...</p>
        </div>
      </div>
    );
  }

  const { kpis, trend_data, top_plants, utility_sales, active_anomaly_count } = data;

  // ── Metric cards config ───────────────────────────────────────────────────
  const metricCards = [
    {
      title: "Total Generation",
      value: formatMWh(kpis.total_generation_mwh),
      trend: kpis.generation_trend,
      icon: <Zap className="w-4 h-4" />,
      accent: "#3b82f6",
      subtitle: "vs. previous month",
    },
    {
      title: "Cross-Border Import",
      value: formatMWh(kpis.cross_border_import_mwh),
      trend: kpis.import_trend,
      icon: <ArrowDownToLine className="w-4 h-4" />,
      accent: "#8b5cf6",
      subtitle: "4 active circuits",
    },
    {
      title: "Total Available Energy",
      value: formatMWh(kpis.total_available_energy_mwh),
      icon: <Battery className="w-4 h-4" />,
      accent: "#06b6d4",
      subtitle: "Generation + Import",
    },
    {
      title: "Total Utility Sales",
      value: formatMWh(kpis.total_utility_sales_mwh),
      trend: kpis.sales_trend,
      icon: <DollarSign className="w-4 h-4" />,
      accent: "#10b981",
      subtitle: "6 distribution utilities",
    },
    {
      title: "System Loss (KWh)",
      value: formatKWh(kpis.system_loss_kwh),
      trend: kpis.loss_trend,
      icon: <TrendingDown className="w-4 h-4" />,
      accent: "#f59e0b",
      subtitle: "Technical + Commercial",
    },
    {
      title: "System Loss (%)",
      value: `${kpis.system_loss_percent.toFixed(2)}%`,
      trend: kpis.loss_trend,
      icon: <AlertTriangle className="w-4 h-4" />,
      accent: kpis.system_loss_percent > 16 ? "#ef4444" : "#f59e0b",
      subtitle: kpis.system_loss_percent > 16 ? "⚠ Above threshold (16%)" : "Within threshold",
    },
  ];

  return (
    <div className="min-h-screen bg-[#080f1e] text-slate-100 p-6 space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            Executive Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            BPDB Power Intelligence Platform — April 2026 Summary
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            Updated: {lastUpdated.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchDashboard}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1e293b] border border-[#334155] text-slate-300 text-sm hover:bg-[#334155] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          {active_anomaly_count > 0 && (
            <button
              onClick={() => router.push("/anomalies")}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm hover:bg-rose-500/20 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {active_anomaly_count} Active Anomalies
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {metricCards.map((card) => (
          <MetricCard key={card.title} {...card} />
        ))}
      </div>

      {/* ── Charts Row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* 12-Month Rolling Trend Chart — spans 2 cols */}
        <div className="xl:col-span-2 rounded-xl bg-[#0f172a] border border-[#1e293b] p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                12-Month Rolling Trends
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Generation vs Losses vs Utility Sales (GWh)
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend_data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradGen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradLoss" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="month"
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={{ stroke: "#1e293b" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: "12px", color: "#94a3b8", paddingTop: "12px" }}
              />
              <Area
                type="monotone"
                dataKey="generation"
                name="Generation"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#gradGen)"
                dot={false}
                activeDot={{ r: 4, fill: "#3b82f6" }}
              />
              <Area
                type="monotone"
                dataKey="sales"
                name="Sales"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#gradSales)"
                dot={false}
                activeDot={{ r: 4, fill: "#10b981" }}
              />
              <Area
                type="monotone"
                dataKey="losses"
                name="Losses"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#gradLoss)"
                dot={false}
                activeDot={{ r: 4, fill: "#ef4444" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Energy Flow Diagram */}
        <div className="rounded-xl bg-[#0f172a] border border-[#1e293b] p-5">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-slate-100">Energy Flow</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Inputs → Available → Outputs
            </p>
          </div>
          <EnergyFlowDiagram kpis={kpis} />

          {/* Summary stats */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[
              { label: "Plant Factor", value: "67.4%", color: "#3b82f6" },
              { label: "Load Factor", value: "84.5%", color: "#10b981" },
              { label: "Aux. Usage", value: "4.2%", color: "#f59e0b" },
              { label: "Circuit Avail.", value: "98.1%", color: "#8b5cf6" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg bg-[#1e293b] p-3 text-center"
              >
                <p className="text-lg font-bold font-mono" style={{ color: stat.color }}>
                  {stat.value}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Data Tables Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Top 5 Power Plants */}
        <div className="rounded-xl bg-[#0f172a] border border-[#1e293b] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Top 5 Power Plants
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">By generation efficiency</p>
            </div>
            <button
              onClick={() => router.push("/generation-management")}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View All <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e293b]">
                  {["#", "Plant", "Capacity", "Generation", "Efficiency", "PF", "Fuel"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-slate-500 font-medium pb-3 pr-4 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b]">
                {top_plants.map((plant) => (
                  <tr key={plant.rank} className="hover:bg-[#1e293b] transition-colors">
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex w-5 h-5 items-center justify-center rounded text-xs font-bold ${
                          plant.rank === 1
                            ? "bg-amber-500/20 text-amber-400"
                            : plant.rank === 2
                            ? "bg-slate-400/20 text-slate-400"
                            : plant.rank === 3
                            ? "bg-orange-600/20 text-orange-400"
                            : "bg-slate-700 text-slate-500"
                        }`}
                      >
                        {plant.rank}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-200 font-medium max-w-[140px] truncate">
                      {plant.name}
                    </td>
                    <td className="py-3 pr-4 text-slate-400 font-mono">
                      {plant.capacity_mw}MW
                    </td>
                    <td className="py-3 pr-4 text-slate-300 font-mono">
                      {(plant.generation_mwh / 1000).toFixed(0)}K
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${plant.efficiency_percent}%`,
                              background:
                                plant.efficiency_percent >= 70
                                  ? "#10b981"
                                  : plant.efficiency_percent >= 60
                                  ? "#f59e0b"
                                  : "#ef4444",
                            }}
                          />
                        </div>
                        <span className="text-slate-300 font-mono">
                          {plant.efficiency_percent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-400 font-mono">
                      {plant.plant_factor.toFixed(3)}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          plant.fuel_type === "Coal"
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-blue-500/10 text-blue-400"
                        }`}
                      >
                        {plant.fuel_type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Utility Sales Summary */}
        <div className="rounded-xl bg-[#0f172a] border border-[#1e293b] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Utility Sales Matrix
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">April 2026 distribution</p>
            </div>
            <button
              onClick={() => router.push("/utility-sales")}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View All <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e293b]">
                  {["Utility", "Sales (MWh)", "Share", "Revenue", "Tariff/kWh"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-slate-500 font-medium pb-3 pr-4 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e293b]">
                {utility_sales.map((u) => (
                  <tr key={u.utility} className="hover:bg-[#1e293b] transition-colors">
                    <td className="py-3 pr-4">
                      <span className="font-semibold text-slate-200">{u.utility}</span>
                    </td>
                    <td className="py-3 pr-4 text-slate-300 font-mono">
                      {u.sales_mwh.toLocaleString()}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${u.sales_percent}%` }}
                          />
                        </div>
                        <span className="text-slate-400 font-mono">
                          {u.sales_percent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-300 font-mono">
                      {formatBDT(u.revenue_bdt)}
                    </td>
                    <td className="py-3 pr-4 text-slate-400 font-mono">
                      ৳{u.tariff_per_kwh.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#334155]">
                  <td className="py-3 pr-4 text-slate-300 font-semibold">Total</td>
                  <td className="py-3 pr-4 text-slate-200 font-mono font-semibold">
                    {utility_sales
                      .reduce((s, u) => s + u.sales_mwh, 0)
                      .toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-slate-300 font-mono font-semibold">
                    100%
                  </td>
                  <td className="py-3 pr-4 text-emerald-400 font-mono font-semibold">
                    {formatBDT(utility_sales.reduce((s, u) => s + u.revenue_bdt, 0))}
                  </td>
                  <td className="py-3 pr-4 text-slate-400 font-mono">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* ── Quick Actions Panel ─────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[#0f172a] border border-[#1e293b] p-5">
        <h2 className="text-base font-semibold text-slate-100 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => router.push("/month-lock")}
            className="flex items-center gap-3 p-4 rounded-lg bg-[#1e293b] border border-[#334155] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all group text-left"
          >
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
              <Lock className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">Lock Month</p>
              <p className="text-xs text-slate-500">Finalize period data</p>
            </div>
          </button>

          <button
            onClick={() => router.push("/month-lock?action=unlock")}
            className="flex items-center gap-3 p-4 rounded-lg bg-[#1e293b] border border-[#334155] hover:border-amber-500/50 hover:bg-amber-500/5 transition-all group text-left"
          >
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 group-hover:bg-amber-500/20 transition-colors">
              <Unlock className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">Unlock Month</p>
              <p className="text-xs text-slate-500">Request adjustment</p>
            </div>
          </button>

          <button
            onClick={() => router.push("/anomalies")}
            className="flex items-center gap-3 p-4 rounded-lg bg-[#1e293b] border border-[#334155] hover:border-rose-500/50 hover:bg-rose-500/5 transition-all group text-left"
          >
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 group-hover:bg-rose-500/20 transition-colors">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">Anomalies</p>
              <p className="text-xs text-rose-400 font-medium">
                {active_anomaly_count} active alerts
              </p>
            </div>
          </button>

          <button
            onClick={() => router.push("/ai-copilot")}
            className="flex items-center gap-3 p-4 rounded-lg bg-[#1e293b] border border-[#334155] hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group text-left"
          >
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 group-hover:bg-blue-500/20 transition-colors">
              <Bot className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">AI Copilot</p>
              <p className="text-xs text-slate-500">Ask in Bengali/English</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
