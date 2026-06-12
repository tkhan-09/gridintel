"use client";

import { useState, useEffect, useCallback } from "react";
import apiClient from "@/lib/api_client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Plant {
  id: number;
  name: string;
}

interface Meter {
  id: number;
  plant_id: number;
  meter_number: string;
  meter_type: string | null;
  multiplier: number | null;
  direction: string | null;
}

interface MeterCreate {
  plant_id: number;
  meter_number: string;
  meter_type: string;
  multiplier: number;
  direction: string;
}

const METER_TYPES = ["Import", "Export", "Check", "Main", "Auxiliary"];
const DIRECTIONS = ["Import", "Export", "Bidirectional"];

// ─── Modal ────────────────────────────────────────────────────────────────────
function MeterModal({
  meter,
  plants,
  onClose,
  onSave,
}: {
  meter: Meter | null;
  plants: Plant[];
  onClose: () => void;
  onSave: (data: MeterCreate, id?: number) => Promise<void>;
}) {
  const [form, setForm] = useState<MeterCreate>({
    plant_id: meter?.plant_id ?? (plants[0]?.id ?? 0),
    meter_number: meter?.meter_number ?? "",
    meter_type: meter?.meter_type ?? METER_TYPES[0],
    multiplier: meter?.multiplier ?? 1.0,
    direction: meter?.direction ?? DIRECTIONS[0],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.meter_number.trim()) {
      setError("Meter number is required.");
      return;
    }
    if (!form.plant_id) {
      setError("Please select a plant.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(form, meter?.id);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f1c2e] border border-[#1e3a5f] rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#1e3a5f]">
          <h2 className="text-lg font-semibold text-white">
            {meter ? "Edit Meter" : "Add New Meter"}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2 rounded-lg">
              {error}
            </div>
          )}

          {/* Plant */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
              Plant
            </label>
            <select
              value={form.plant_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, plant_id: Number(e.target.value) }))
              }
              className="w-full bg-[#0a1628] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-cyan-500 transition-colors"
            >
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Meter Number */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
              Meter Number
            </label>
            <input
              type="text"
              value={form.meter_number}
              onChange={(e) =>
                setForm((f) => ({ ...f, meter_number: e.target.value }))
              }
              placeholder="e.g. MTR-2024-001"
              className="w-full bg-[#0a1628] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2.5 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Meter Type & Direction */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                Meter Type
              </label>
              <select
                value={form.meter_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, meter_type: e.target.value }))
                }
                className="w-full bg-[#0a1628] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-cyan-500 transition-colors"
              >
                {METER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                Direction
              </label>
              <select
                value={form.direction}
                onChange={(e) =>
                  setForm((f) => ({ ...f, direction: e.target.value }))
                }
                className="w-full bg-[#0a1628] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-cyan-500 transition-colors"
              >
                {DIRECTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Multiplier */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
              Multiplier (CT/PT Ratio)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.multiplier}
              onChange={(e) =>
                setForm((f) => ({ ...f, multiplier: parseFloat(e.target.value) || 1 }))
              }
              className="w-full bg-[#0a1628] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#1e3a5f] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-[#1e3a5f] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-[#0a1628] rounded-lg transition-colors"
          >
            {saving ? "Saving..." : meter ? "Save Changes" : "Add Meter"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteConfirmModal({
  meter,
  onClose,
  onConfirm,
}: {
  meter: Meter;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f1c2e] border border-[#1e3a5f] rounded-2xl w-full max-w-sm mx-4 shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-semibold">Delete Meter</h3>
            <p className="text-slate-400 text-sm mt-0.5">
              Remove <span className="text-white font-medium">{meter.meter_number}</span>? This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-[#1e3a5f] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Direction Badge ──────────────────────────────────────────────────────────
function DirectionBadge({ direction }: { direction: string | null }) {
  if (!direction) return <span className="text-slate-600">—</span>;
  const colors: Record<string, string> = {
    Import: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Export: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Bidirectional: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };
  const cls = colors[direction] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>
      {direction}
    </span>
  );
}

// ─── Meter Type Badge ─────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-slate-600">—</span>;
  const colors: Record<string, string> = {
    Main: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    Check: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    Import: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    Export: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Auxiliary: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  };
  const cls = colors[type] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${cls}`}>
      {type}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MetersPage() {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("All");
  const [filterDirection, setFilterDirection] = useState("All");

  const [showModal, setShowModal] = useState(false);
  const [editingMeter, setEditingMeter] = useState<Meter | null>(null);
  const [deletingMeter, setDeletingMeter] = useState<Meter | null>(null);

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [metersRes, plantsRes] = await Promise.all([
        apiClient.get<Meter[]>("/meters/"),
        apiClient.get<Plant[]>("/plants/"),
      ]);
      setMeters(metersRes.data);
      setPlants(plantsRes.data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load meters.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── CRUD ──
  const handleSave = async (data: MeterCreate, id?: number) => {
    if (id) {
      await apiClient.put(`/meters/${id}`, data);
    } else {
      await apiClient.post("/meters/", data);
    }
    await fetchData();
  };

  const handleDelete = async (meter: Meter) => {
    await apiClient.delete(`/meters/${meter.id}`);
    await fetchData();
  };

  // ── Plant name lookup ──
  const plantName = (plantId: number) =>
    plants.find((p) => p.id === plantId)?.name ?? `Plant #${plantId}`;

  // ── Filtered list ──
  const filtered = meters.filter((m) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      m.meter_number.toLowerCase().includes(q) ||
      (m.meter_type ?? "").toLowerCase().includes(q) ||
      plantName(m.plant_id).toLowerCase().includes(q);
    const matchType = filterType === "All" || m.meter_type === filterType;
    const matchDir = filterDirection === "All" || m.direction === filterDirection;
    return matchSearch && matchType && matchDir;
  });

  // ── Stats ──
const totalMeters = meters.length;
const exportCount = meters.filter((m) => m.direction === "Export").length;
const stationCount = meters.filter((m) => m.direction === "Station").length;
const checkCount = meters.filter((m) => m.meter_type === "Check").length;

  return (
    <div className="min-h-screen bg-[#060f1a] text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Meters</h1>
            <p className="text-slate-400 text-sm mt-1">
              Manage metering points across all power plants
            </p>
          </div>
          <button
            onClick={() => { setEditingMeter(null); setShowModal(true); }}
            className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-[#060f1a] font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-cyan-500/20"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Meter
          </button>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Meters",   value: totalMeters,   color: "text-cyan-400",    icon: "⚡" },
            { label: "Export Meters",  value: exportCount,   color: "text-emerald-400", icon: "↑" },
            { label: "Station Meters", value: stationCount,  color: "text-purple-400",  icon: "⊡" },
            { label: "Check Meters",   value: checkCount,    color: "text-yellow-400",  icon: "◎" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-[#0f1c2e] border border-[#1e3a5f] rounded-xl px-5 py-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">
                  {stat.label}
                </span>
                <span className="text-lg">{stat.icon}</span>
              </div>
              <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search meters..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#0f1c2e] border border-[#1e3a5f] text-white text-sm rounded-xl pl-9 pr-4 py-2.5 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Type filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-[#0f1c2e] border border-[#1e3a5f] text-sm text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500 transition-colors"
          >
            <option value="All">All Types</option>
            {METER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Direction filter */}
          <select
            value={filterDirection}
            onChange={(e) => setFilterDirection(e.target.value)}
            className="bg-[#0f1c2e] border border-[#1e3a5f] text-sm text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500 transition-colors"
          >
            <option value="All">All Directions</option>
            {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* ── Content ── */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 text-sm">Loading meters...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-slate-400 text-sm">{error}</p>
            <button onClick={fetchData} className="text-cyan-400 text-sm hover:text-cyan-300 underline">
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#0f1c2e] border border-[#1e3a5f] flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-white font-medium">No meters found</p>
              <p className="text-slate-500 text-sm mt-1">
                {search || filterType !== "All" || filterDirection !== "All"
                  ? "Try adjusting your filters"
                  : "Add your first meter to get started"}
              </p>
            </div>
            {!search && filterType === "All" && filterDirection === "All" && (
              <button
                onClick={() => { setEditingMeter(null); setShowModal(true); }}
                className="text-cyan-400 text-sm hover:text-cyan-300 underline"
              >
                Add a meter
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Result count */}
            <p className="text-xs text-slate-500 mb-4">
              Showing {filtered.length} of {totalMeters} meter{totalMeters !== 1 ? "s" : ""}
            </p>

            {/* Table */}
            <div className="bg-[#0f1c2e] border border-[#1e3a5f] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#1e3a5f]">
                      {["Meter Number", "Plant", "Type", "Direction", "Multiplier", "Actions"].map(
                        (h) => (
                          <th
                            key={h}
                            className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-5 py-4"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e3a5f]/50">
                    {filtered.map((meter) => (
                      <tr
                        key={meter.id}
                        className="hover:bg-white/[0.02] transition-colors group"
                      >
                        {/* Meter Number */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                  d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                              </svg>
                            </div>
                            <span className="font-mono text-sm font-medium text-white">
                              {meter.meter_number}
                            </span>
                          </div>
                        </td>

                        {/* Plant */}
                        <td className="px-5 py-4">
                          <span className="text-sm text-slate-300">{plantName(meter.plant_id)}</span>
                        </td>

                        {/* Type */}
                        <td className="px-5 py-4">
                          <TypeBadge type={meter.meter_type} />
                        </td>

                        {/* Direction */}
                        <td className="px-5 py-4">
                          <DirectionBadge direction={meter.direction} />
                        </td>

                        {/* Multiplier */}
                        <td className="px-5 py-4">
                          <span className="text-sm font-mono text-slate-300">
                            {meter.multiplier != null
                              ? `×${meter.multiplier.toFixed(2)}`
                              : "—"}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingMeter(meter); setShowModal(true); }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                              title="Edit"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDeletingMeter(meter)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Delete"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {showModal && (
        <MeterModal
          meter={editingMeter}
          plants={plants}
          onClose={() => { setShowModal(false); setEditingMeter(null); }}
          onSave={handleSave}
        />
      )}
      {deletingMeter && (
        <DeleteConfirmModal
          meter={deletingMeter}
          onClose={() => setDeletingMeter(null)}
          onConfirm={() => handleDelete(deletingMeter)}
        />
      )}
    </div>
  );
}