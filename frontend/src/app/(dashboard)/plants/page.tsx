"use client";

import { useEffect, useState, useCallback } from "react";
import apiClient from "@/lib/api_client";

interface Office { id: number; name: string; }
interface Plant {
  id: number; name: string; code: string | null; capacity_mw: number | null;
  fuel_type: string | null; technology: string | null; ownership: string | null;
  sector: string | null; grid_voltage: string | null; office_id: number | null; status: string | null;
}

const FUEL_TYPES = ["Gas","Coal","Water","Oil","Solar","Wind","Nuclear","Diesel","Furnace Oil"];
const TECHNOLOGIES = ["Combined Cycle","Steam Turbine","Hydro Turbine","Gas Turbine","Solar PV","Wind Turbine","Diesel Engine"];
const OWNERSHIP_TYPES = ["BPDB Own","Joint Venture (NPCBL)","Joint Venture (BIFPCL)","IPP","SIPP","Rental"];
const SECTORS = ["Public","Private","Joint Venture"];
const GRID_VOLTAGES = ["11kV","33kV","132kV","230kV","400kV"];
const STATUS_OPTIONS = ["Active","Inactive","Under Maintenance","Decommissioned"];

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "Unknown";
  const map: Record<string,string> = {
    Active: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    Inactive: "bg-slate-500/20 text-slate-400 border border-slate-500/30",
    "Under Maintenance": "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    Decommissioned: "bg-red-500/20 text-red-400 border border-red-500/30",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[s] ?? "bg-slate-700 text-slate-300"}`}>{s}</span>;
}

function FuelBadge({ fuel }: { fuel: string | null }) {
  const f = fuel ?? "—";
  const map: Record<string,string> = {
    Gas: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30",
    Coal: "bg-stone-500/20 text-stone-400 border border-stone-500/30",
    Water: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    Oil: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
    Solar: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    Wind: "bg-teal-500/20 text-teal-400 border border-teal-500/30",
    Nuclear: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
    Diesel: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    "Furnace Oil": "bg-red-500/20 text-red-400 border border-red-500/30",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[f] ?? "bg-slate-700 text-slate-300"}`}>{f}</span>;
}

function PlantModal({ plant, offices, onClose, onSave }: { plant: Partial<Plant> | null; offices: Office[]; onClose: () => void; onSave: (data: Partial<Plant>) => void; }) {
  const isEdit = !!plant?.id;
  const [form, setForm] = useState<Partial<Plant>>(plant ?? { name:"",code:"",capacity_mw:0,fuel_type:"Gas",technology:"Combined Cycle",ownership:"BPDB Own",sector:"Public",grid_voltage:"132kV",office_id:null,status:"Active" });
  const set = (k: keyof Plant, v: unknown) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1729] border border-slate-700/50 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-white">{isEdit ? "Edit Power Plant" : "Add Power Plant"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">x</button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
          <div className="col-span-2">
            <label className="block text-xs text-slate-400 mb-1">Plant Name</label>
            <input className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50" value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Ashuganj 450MW" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Plant Code</label>
            <input className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50" value={form.code ?? ""} onChange={(e) => set("code", e.target.value)} placeholder="e.g. ASH-450" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Capacity (MW)</label>
            <input type="number" className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50" value={form.capacity_mw ?? 0} onChange={(e) => set("capacity_mw", parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Fuel Type</label>
            <select className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50" value={form.fuel_type ?? ""} onChange={(e) => set("fuel_type", e.target.value)}>{FUEL_TYPES.map((f) => <option key={f}>{f}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Technology</label>
            <select className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50" value={form.technology ?? ""} onChange={(e) => set("technology", e.target.value)}>{TECHNOLOGIES.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ownership</label>
            <select className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50" value={form.ownership ?? ""} onChange={(e) => set("ownership", e.target.value)}>{OWNERSHIP_TYPES.map((o) => <option key={o}>{o}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Sector</label>
            <select className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50" value={form.sector ?? ""} onChange={(e) => set("sector", e.target.value)}>{SECTORS.map((s) => <option key={s}>{s}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Grid Voltage</label>
            <select className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50" value={form.grid_voltage ?? ""} onChange={(e) => set("grid_voltage", e.target.value)}>{GRID_VOLTAGES.map((g) => <option key={g}>{g}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Office / Zone</label>
            <select className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50" value={form.office_id ?? ""} onChange={(e) => set("office_id", e.target.value ? parseInt(e.target.value) : null)}>
              <option value="">No Office</option>
              {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Status</label>
            <select className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50" value={form.status ?? "Active"} onChange={(e) => set("status", e.target.value)}>{STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}</select>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700/50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button onClick={() => onSave(form)} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm rounded-lg">{isEdit ? "Save Changes" : "Add Plant"}</button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({ plant, onClose, onConfirm }: { plant: Plant; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f1729] border border-slate-700/50 rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-2">Delete Plant?</h2>
        <p className="text-sm text-slate-400 mb-6"><span className="text-white font-medium">{plant.name}</span> permanently delete হবে।</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white text-sm font-semibold rounded-lg">Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function PowerPlantsPage() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterFuel, setFilterFuel] = useState("All");
  const [filterOffice, setFilterOffice] = useState("All");
  const [modal, setModal] = useState<"add"|"edit"|"delete"|null>(null);
  const [selected, setSelected] = useState<Plant | null>(null);

  const fetchPlants = useCallback(async () => {
    try {
      const res = await apiClient.get<Plant[]>("/plants/");
      setPlants(Array.isArray(res.data) ? res.data : []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  const fetchOffices = useCallback(async () => {
    try {
      const res = await apiClient.get<Office[]>("/offices/");
      setOffices(Array.isArray(res.data) ? res.data : []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchPlants(); fetchOffices(); }, [fetchPlants, fetchOffices]);

  const totalPlants = plants.length;
  const activeCount = plants.filter((p) => p.status === "Active").length;
  const inactiveCount = plants.filter((p) => p.status === "Inactive" || p.status === "Decommissioned").length;
  const totalCapacity = plants.reduce((acc, p) => acc + (p.capacity_mw ?? 0), 0);

  const filtered = plants.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.code ?? "").toLowerCase().includes(q) || (p.fuel_type ?? "").toLowerCase().includes(q);
    const matchStatus = filterStatus === "All" || p.status === filterStatus;
    const matchFuel = filterFuel === "All" || p.fuel_type === filterFuel;
    const matchOffice = filterOffice === "All" || (filterOffice === "None" ? p.office_id === null : p.office_id === parseInt(filterOffice));
    return matchSearch && matchStatus && matchFuel && matchOffice;
  });

  const handleSave = async (data: Partial<Plant>) => {
    if (selected?.id) { await apiClient.put(`/plants/${selected.id}`, data); }
    else { await apiClient.post("/plants/", data); }
    setModal(null); setSelected(null); fetchPlants();
  };

  const handleDelete = async () => {
    if (!selected) return;
    await apiClient.delete(`/plants/${selected.id}`);
    setModal(null); setSelected(null); fetchPlants();
  };

  const officeName = (id: number | null) => id ? offices.find((o) => o.id === id)?.name ?? `Office #${id}` : "—";

  return (
    <div className="min-h-screen bg-[#080f1e] p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Power Plants</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage all BPDB power generation assets</p>
        </div>
        <button onClick={() => { setSelected(null); setModal("add"); }} className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm rounded-xl transition-colors">
          + Add Plant
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "TOTAL PLANTS", value: totalPlants, color: "text-cyan-400", icon: "⚡" },
          { label: "ACTIVE PLANTS", value: activeCount, color: "text-emerald-400", icon: "✓" },
          { label: "INACTIVE / DECO", value: inactiveCount, color: "text-slate-400", icon: "✕" },
          { label: "TOTAL CAPACITY", value: `${totalCapacity.toFixed(0)} MW`, color: "text-yellow-400", icon: "◉" },
        ].map((s) => (
          <div key={s.label} className="bg-[#0f1729] border border-slate-700/40 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 font-medium tracking-wider">{s.label}</span>
              <span className={`text-lg ${s.color}`}>{s.icon}</span>
            </div>
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-60">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
          <input className="w-full bg-[#0f1729] border border-slate-700/40 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50" placeholder="Search plants..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="bg-[#0f1729] border border-slate-700/40 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="All">All Status</option>
          {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="bg-[#0f1729] border border-slate-700/40 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none" value={filterFuel} onChange={(e) => setFilterFuel(e.target.value)}>
          <option value="All">All Fuels</option>
          {FUEL_TYPES.map((f) => <option key={f}>{f}</option>)}
        </select>
        <select className="bg-[#0f1729] border border-slate-700/40 rounded-xl px-3 py-2.5 text-sm text-slate-300 focus:outline-none" value={filterOffice} onChange={(e) => setFilterOffice(e.target.value)}>
          <option value="All">All Offices</option>
          <option value="None">No Office</option>
          {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>

      <p className="text-sm text-slate-500">Showing {filtered.length} of {plants.length} plants</p>

      <div style={{overflowX: "auto", borderRadius: "1rem", border: "1px solid rgba(100,116,139,0.4)", background: "#0f1729"}}>
        <table style={{width: "100%", minWidth: "900px", fontSize: "0.875rem", borderCollapse: "collapse"}}>
          <thead>
            <tr style={{borderBottom: "1px solid rgba(100,116,139,0.4)"}}>
              {["PLANT","CODE","CAP","FUEL","TECHNOLOGY","OWNERSHIP","OFFICE","STATUS","ACTIONS"].map((h) => (
                <th key={h} style={{textAlign: "left", fontSize: "0.75rem", color: "#64748b", fontWeight: 500, padding: "12px 16px", whiteSpace: "nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{textAlign: "center", color: "#64748b", padding: "48px"}}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{textAlign: "center", color: "#64748b", padding: "48px"}}>No plants found</td></tr>
            ) : (
              filtered.map((p, i) => (
                <tr key={p.id} style={{borderBottom: "1px solid rgba(100,116,139,0.2)", background: i % 2 === 0 ? "transparent" : "rgba(30,41,59,0.1)"}}>
                  <td style={{padding: "12px 16px"}}>
                    <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                      <div style={{width: "28px", height: "28px", borderRadius: "8px", background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#22d3ee", fontSize: "12px", flexShrink: 0}}>⚡</div>
                      <span style={{color: "white", fontWeight: 500, maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}} title={p.name}>{p.name}</span>
                    </div>
                  </td>
                  <td style={{padding: "12px 16px", color: "#94a3b8", fontFamily: "monospace", fontSize: "12px", whiteSpace: "nowrap"}}>{p.code ?? "—"}</td>
                  <td style={{padding: "12px 16px", color: "#cbd5e1", whiteSpace: "nowrap"}}>{p.capacity_mw != null ? `${p.capacity_mw} MW` : "—"}</td>
                  <td style={{padding: "12px 16px"}}><FuelBadge fuel={p.fuel_type} /></td>
                  <td style={{padding: "12px 16px", color: "#94a3b8", fontSize: "12px", maxWidth: "110px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{p.technology ?? "—"}</td>
                  <td style={{padding: "12px 16px", color: "#94a3b8", fontSize: "12px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{p.ownership ?? "—"}</td>
                  <td style={{padding: "12px 16px", color: "#94a3b8", fontSize: "12px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{officeName(p.office_id)}</td>
                  <td style={{padding: "12px 16px"}}><StatusBadge status={p.status} /></td>
                  <td style={{padding: "12px 16px"}}>
                    <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                      <button onClick={() => { setSelected(p); setModal("edit"); }} style={{color: "#94a3b8", fontSize: "12px", padding: "4px 8px", borderRadius: "4px", background: "transparent", border: "none", cursor: "pointer", whiteSpace: "nowrap"}}>Edit</button>
                      <button onClick={() => { setSelected(p); setModal("delete"); }} style={{color: "#94a3b8", fontSize: "12px", padding: "4px 8px", borderRadius: "4px", background: "transparent", border: "none", cursor: "pointer", whiteSpace: "nowrap"}}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(modal === "add" || modal === "edit") && (
        <PlantModal plant={modal === "edit" ? selected : null} offices={offices} onClose={() => { setModal(null); setSelected(null); }} onSave={handleSave} />
      )}
      {modal === "delete" && selected && (
        <DeleteModal plant={selected} onClose={() => { setModal(null); setSelected(null); }} onConfirm={handleDelete} />
      )}
    </div>
  );
}
