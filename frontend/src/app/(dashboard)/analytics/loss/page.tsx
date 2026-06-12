'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line, ReferenceLine,
} from 'recharts';
import {
  TrendingDown, AlertTriangle, ArrowUpRight, ArrowDownRight,
  RefreshCw, Activity, Zap, BarChart2,
} from 'lucide-react';
import apiClient from '@/lib/api_client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TrendPoint {
  month: number;
  year: number;
  generation_mu: number;
  sales_mu: number;
  loss_mu: number;
  import_mu: number;
  loss_pct: number;
}

interface KPIData {
  total_loss: number;
  loss_pct: number;
  total_gen: number;
  total_available: number;
  total_sales: number;
}

interface KPICard {
  label: string;
  value: string | number;
  unit: string;
  delta_pct?: number | null;
  delta_label?: string | null;
  trend?: string;
}

interface DashboardAPIResponse {
  month: number;
  year: number;
  office_id: string | null;
  kpi_cards: KPICard[];
  monthly_trends: Array<{
    month: number;
    year: number;
    generation_mu: number;
    sales_mu: number;
    loss_mu: number;
    import_mu: number;
    loss_pct: number;
  }>;
  top_plants: Array<{
    plant_id: string;
    plant_name: string;
    fuel_type: string;
    capacity_mw: number;
    net_gen_mu: number;
  }>;
  generated_at: string;
}

interface Office {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtMU(val: number): string {
  if (val >= 1000) return `${(val / 1000).toFixed(2)}B MU`;
  if (val >= 1) return `${val.toFixed(2)} MU`;
  if (val >= 0.001) return `${(val * 1000).toFixed(2)} kMU`;
  return `${val.toFixed(4)} MU`;
}

function fmtPct(val: number): string {
  return `${Number(val).toFixed(2)}%`;
}

function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]}-${String(year).slice(2)}`;
}

// ─── Custom Tooltip ────────────────────────────────────────────────────────────

function LossTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-lg p-3 text-xs shadow-xl">
      <p className="text-slate-400 mb-2 font-medium">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="text-slate-100 font-mono font-semibold">
            {p.dataKey === 'loss_pct' ? fmtPct(p.value) : fmtMU(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Loss Gauge ────────────────────────────────────────────────────────────────

function LossGauge({ pct }: { pct: number }) {
  const clamped = Math.min(Math.max(pct, 0), 30);
  const angle = (clamped / 30) * 180 - 90;
  const color = pct < 10 ? '#10b981' : pct < 15 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex flex-col items-center justify-center">
      <svg viewBox="0 0 200 110" className="w-48 h-28">
        {/* Track */}
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1e293b" strokeWidth="16" strokeLinecap="round" />
        {/* Green zone */}
        <path d="M 20 100 A 80 80 0 0 1 87 22" fill="none" stroke="#10b98130" strokeWidth="16" strokeLinecap="round" />
        {/* Yellow zone */}
        <path d="M 87 22 A 80 80 0 0 1 133 28" fill="none" stroke="#f59e0b30" strokeWidth="16" strokeLinecap="round" />
        {/* Red zone */}
        <path d="M 133 28 A 80 80 0 0 1 180 100" fill="none" stroke="#ef444430" strokeWidth="16" strokeLinecap="round" />
        {/* Needle */}
        <line
          x1="100" y1="100"
          x2={100 + 65 * Math.cos(((angle - 90) * Math.PI) / 180)}
          y2={100 + 65 * Math.sin(((angle - 90) * Math.PI) / 180)}
          stroke={color} strokeWidth="3" strokeLinecap="round"
        />
        <circle cx="100" cy="100" r="6" fill={color} />
        {/* Labels */}
        <text x="16" y="115" fontSize="9" fill="#64748b">0%</text>
        <text x="88" y="14" fontSize="9" fill="#64748b" textAnchor="middle">15%</text>
        <text x="178" y="115" fontSize="9" fill="#64748b" textAnchor="end">30%</text>
      </svg>
      <p className="text-3xl font-bold font-mono -mt-2" style={{ color }}>{fmtPct(pct)}</p>
      <p className="text-xs text-slate-500 mt-1">System Loss Rate</p>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string;
  delta?: number;
  icon: React.ReactNode;
  accent: string;
  sub?: string;
}

function StatCard({ title, value, delta, icon, accent, sub }: StatCardProps) {
  const up = delta !== undefined && delta >= 0;
  return (
    <div className="relative overflow-hidden rounded-xl bg-[#0f172a] border border-[#1e293b] p-5 flex flex-col gap-3 hover:border-[#334155] transition-colors group">
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 blur-2xl group-hover:opacity-20 transition-opacity" style={{ background: accent }} />
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-lg" style={{ background: `${accent}20`, border: `1px solid ${accent}40` }}>
          <div style={{ color: accent }}>{icon}</div>
        </div>
        {delta !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${up ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
            {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(delta).toFixed(1)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-100 font-mono">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LossAnalysisPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [officeId, setOfficeId] = useState<string>('');
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kpi, setKpi] = useState<KPIData | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [prevLossPct, setPrevLossPct] = useState<number | null>(null);

  // Fetch offices
  useEffect(() => {
    apiClient.get('/offices').then(res => {
      setOffices(res.data?.offices ?? res.data ?? []);
    }).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { month: month, year: year };
      console.log('Fetching loss data for:', month, year);
      if (officeId) params.office_id = officeId;

      const res = await apiClient.get<DashboardAPIResponse>('/analytics/dashboard', { params });
      const data = res.data;

      // Extract KPIs from kpi_cards array
      const kpiArr = data.kpi_cards ?? [];
      const findKPI = (label: string) =>
        kpiArr.find((k) => k.label?.toLowerCase().includes(label.toLowerCase()));

      const lossCard = findKPI('loss');
      const genCard  = findKPI('generation');
      const salesCard = findKPI('sales');
      const availCard = findKPI('available');

      const parseNum = (v: any): number => {
        if (typeof v === 'number') return v;
        return parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0;
      };

      // API values are in KWh — divide by 1,000,000 to get MU
      const KWH_TO_MU = 1_000_000;
      const lossMU  = parseNum(lossCard?.value ?? 0) / KWH_TO_MU;
      const genMU   = parseNum(genCard?.value ?? 0) / KWH_TO_MU;
      const salesMU = parseNum(salesCard?.value ?? 0) / KWH_TO_MU;
      const availMU = parseNum(availCard?.value ?? 0) / KWH_TO_MU;

      // Trend — field is monthly_trends
      const trendRows: TrendPoint[] = (data.monthly_trends ?? []).map((t) => ({
        month: t.month,
        year: t.year,
        generation_mu: Number(t.generation_mu ?? 0) / KWH_TO_MU,
        sales_mu: Number(t.sales_mu ?? 0) / KWH_TO_MU,
        loss_mu: Number(t.loss_mu ?? 0) / KWH_TO_MU,
        import_mu: Number(t.import_mu ?? 0) / KWH_TO_MU,
        loss_pct: Number(t.loss_pct ?? 0),
      }));
      setTrend(trendRows);

      // loss_pct comes from latest trend row (most accurate)
      const latestTrend = trendRows[trendRows.length - 1];
      const lossPct = latestTrend?.loss_pct ?? 0;

      setKpi({ total_loss: lossMU, loss_pct: lossPct, total_gen: genMU, total_available: availMU, total_sales: salesMU });

      // Previous month loss%
      if (trendRows.length >= 2) {
        setPrevLossPct(trendRows[trendRows.length - 2].loss_pct);
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [month, year, officeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const trendChartData = trend.map(t => ({
    label: monthLabel(t.month, t.year),
    loss_mu: t.loss_mu,
    loss_pct: t.loss_pct,
    generation_mu: t.generation_mu,
    sales_mu: t.sales_mu,
  }));

  const lossDelta = kpi && prevLossPct !== null
    ? kpi.loss_pct - prevLossPct
    : undefined;

  // Avg loss pct over trend
  const avgLossPct = trend.length
    ? trend.reduce((s, t) => s + t.loss_pct, 0) / trend.length
    : null;

  const peakLoss = trend.length
    ? trend.reduce((mx, t) => t.loss_pct > mx.loss_pct ? t : mx, trend[0])
    : null;

  return (
    <div className="min-h-screen bg-[#020b18] text-slate-100">
      {/* ── Header ── */}
      <div className="border-b border-[#1e293b] px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-rose-400" />
              Loss Analysis
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">Transmission & system loss monitoring</p>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Office filter */}
            <select
              value={officeId}
              onChange={e => setOfficeId(e.target.value)}
              className="bg-[#0f172a] border border-[#1e293b] text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#334155]"
            >
              <option value="">All Offices</option>
              {offices.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>

            {/* Month */}
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="bg-[#0f172a] border border-[#1e293b] text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#334155]"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>

            {/* Year */}
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-[#0f172a] border border-[#1e293b] text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#334155]"
            >
              {[2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 bg-[#0f172a] border border-[#1e293b] hover:border-[#334155] text-slate-300 text-sm rounded-lg px-3 py-2 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ── Top Section: Gauge + KPI Cards ── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

          {/* Gauge */}
          <div className="lg:col-span-1 bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 flex items-center justify-center">
            {loading ? (
              <div className="w-48 h-28 bg-[#1e293b] rounded-lg animate-pulse" />
            ) : (
              <LossGauge pct={kpi?.loss_pct ?? 0} />
            )}
          </div>

          {/* KPI Cards */}
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              title="System Loss Volume"
              value={loading ? '—' : fmtMU(kpi?.total_loss ?? 0)}
              delta={lossDelta !== undefined ? lossDelta * 10 : undefined}
              icon={<TrendingDown className="w-4 h-4" />}
              accent="#ef4444"
              sub={`vs previous month`}
            />
            <StatCard
              title="Loss Rate (12mo avg)"
              value={avgLossPct !== null && !loading ? fmtPct(avgLossPct) : '—'}
              icon={<Activity className="w-4 h-4" />}
              accent="#f59e0b"
              sub="Rolling 12-month average"
            />
            <StatCard
              title="Peak Loss Month"
              value={peakLoss && !loading ? fmtPct(peakLoss.loss_pct) : '—'}
              icon={<BarChart2 className="w-4 h-4" />}
              accent="#8b5cf6"
              sub={peakLoss ? monthLabel(peakLoss.month, peakLoss.year) : ''}
            />
          </div>
        </div>

        {/* ── Loss % Trend Chart ── */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Loss Rate Trend</h2>
              <p className="text-xs text-slate-500 mt-0.5">Monthly system loss % over 12 months</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-rose-500 inline-block rounded" />
                Loss %
              </span>
            </div>
          </div>

          {loading ? (
            <div className="h-56 bg-[#1e293b] rounded-lg animate-pulse" />
          ) : trendChartData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-slate-500 text-sm">
              No trend data available for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip content={<LossTooltip />} />
                {avgLossPct !== null && (
                  <ReferenceLine y={avgLossPct} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Avg', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} />
                )}
                <Area type="monotone" dataKey="loss_pct" name="Loss %" stroke="#ef4444" strokeWidth={2} fill="url(#lossGrad)" dot={{ fill: '#ef4444', r: 3 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Generation vs Sales vs Loss Volume ── */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Generation · Sales · Loss Volume</h2>
              <p className="text-xs text-slate-500 mt-0.5">Energy flow comparison across 12 months (MU)</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              {[
                { color: '#3b82f6', label: 'Generation' },
                { color: '#10b981', label: 'Sales' },
                { color: '#ef4444', label: 'Loss' },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 inline-block rounded" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="h-56 bg-[#1e293b] rounded-lg animate-pulse" />
          ) : trendChartData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-slate-500 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}M`} />
                <Tooltip content={<LossTooltip />} />
                <Line type="monotone" dataKey="generation_mu" name="Generation" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="sales_mu"      name="Sales"      stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="loss_mu"       name="Loss"       stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Monthly Loss Table ── */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1e293b] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Monthly Breakdown</h2>
              <p className="text-xs text-slate-500 mt-0.5">Loss volume and rate per month</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e293b]">
                  {['Month', 'Generation (MU)', 'Sales (MU)', 'Loss (MU)', 'Loss %', 'Status'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-[#1e293b]">
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-4 bg-[#1e293b] rounded animate-pulse w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : trend.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500 text-sm">
                      No data available for this period
                    </td>
                  </tr>
                ) : (
                  [...trend].reverse().map((t, i) => {
                    const isHigh = t.loss_pct >= 15;
                    const isMed  = t.loss_pct >= 10 && t.loss_pct < 15;
                    return (
                      <tr key={i} className="border-b border-[#1e293b] hover:bg-[#1e293b]/40 transition-colors">
                        <td className="px-5 py-3 font-medium text-slate-200">{monthLabel(t.month, t.year)}</td>
                        <td className="px-5 py-3 font-mono text-slate-300">{fmtMU(t.generation_mu)}</td>
                        <td className="px-5 py-3 font-mono text-slate-300">{fmtMU(t.sales_mu)}</td>
                        <td className="px-5 py-3 font-mono text-rose-400">{fmtMU(t.loss_mu)}</td>
                        <td className="px-5 py-3 font-mono font-semibold" style={{ color: isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#10b981' }}>
                          {fmtPct(t.loss_pct)}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            isHigh ? 'bg-rose-500/10 text-rose-400' :
                            isMed  ? 'bg-amber-500/10 text-amber-400' :
                                     'bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {isHigh ? <AlertTriangle className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                            {isHigh ? 'High' : isMed ? 'Moderate' : 'Normal'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}t