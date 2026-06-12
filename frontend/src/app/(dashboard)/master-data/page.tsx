"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  Zap,
  Activity,
  Upload,
  FileText,
  Trash2,
  Plus,
  Search,
  RefreshCw,
  CheckCircle,
  Clock,
  AlertTriangle,
  X,
  ChevronDown,
  BarChart2,
} from "lucide-react";
import { apiClient } from "@/lib/api_client";
import { useAuthStore } from "@/store/global_stores";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RagDocument {
  id: number;
  file_path: string;
  title: string;
  doc_type: string;
  status: "processed" | "processing" | "failed";
  chunk_count: number;
  uploaded_at: string;
  file_size_kb?: number;
}

interface Plant {
  id: number;
  name: string;
  capacity_mw: number;
  fuel_type: string;
  technology: string;
  ownership: string;
  sector?: string;
  grid_voltage?: string;
  status: string;
}

interface Meter {
  id: number;
  meter_number: string;
  meter_type: string;
  plant_id: number;
  plant_name?: string;
  multiplier?: number;
  direction?: string;
}

type Tab = "rag" | "plants" | "meters";

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "processed" || status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <CheckCircle size={11} />
        {status === "active" ? "Active" : "Processed"}
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <Clock size={11} className="animate-spin" />
        Processing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
      <AlertTriangle size={11} />
      Inactive
    </span>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("Manual");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const dropRef = useRef<HTMLDivElement>(null);

  const DOC_TYPES = [
    { value: "Manual", label: "Manual" },
    { value: "Policy", label: "Policy" },
    { value: "Regulation", label: "Regulation" },
    { value: "TariffOrder", label: "Tariff Order" },
  ];

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) { setError("Please select a file."); return; }
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("source_type", docType);
      await apiClient.post("/rag/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Upload size={15} className="text-cyan-400" />
            </div>
            <h3 className="text-white font-semibold text-sm">Ingest Document</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div
            ref={dropRef}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById("file-input")?.click()}
            className="border-2 border-dashed border-slate-600 hover:border-cyan-500/50 rounded-xl p-8 text-center cursor-pointer transition-all group"
          >
            <input
              id="file-input"
              type="file"
              accept=".pdf,.txt,.md"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <Upload size={28} className="mx-auto text-slate-500 group-hover:text-cyan-400 mb-3 transition-colors" />
            {file ? (
              <div>
                <p className="text-white text-sm font-medium">{file.name}</p>
                <p className="text-slate-500 text-xs mt-1">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div>
                <p className="text-slate-300 text-sm">Drop a file or click to browse</p>
                <p className="text-slate-500 text-xs mt-1">PDF, TXT, MD supported</p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Document Type</label>
            <div className="relative">
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-cyan-500/50 transition-colors"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading || !file}
            className="flex-1 px-4 py-2.5 text-sm text-white font-medium bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {uploading ? <><RefreshCw size={14} className="animate-spin" /> Ingesting...</> : <><Upload size={14} /> Ingest</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── RAG Tab ──────────────────────────────────────────────────────────────────

function RagDocumentHub() {
  const [docs, setDocs] = useState<RagDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [stats, setStats] = useState({ total: 0, processed: 0, total_chunks: 0 });

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/rag/documents");
      const d = res.data;
      const data = d?.documents || d?.data || d?.results || (Array.isArray(d) ? d : []);
      setDocs(data);
      setStats({
        total: data.length,
        processed: data.length,
        total_chunks: data.reduce((acc: number, d: RagDocument) => acc + (d.chunk_count || 0), 0),
      });
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this document from the knowledge base?")) return;
    try {
      await apiClient.delete(`/rag/documents/${id}`);
      fetchDocs();
    } catch {}
  };

  const filtered = docs.filter(
    (d) => (d.file_path || d.title || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={fetchDocs} />}

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Documents", value: stats.total, icon: FileText, color: "cyan" },
          { label: "Processed", value: stats.processed, icon: CheckCircle, color: "emerald" },
          { label: "Knowledge Chunks", value: stats.total_chunks.toLocaleString(), icon: BarChart2, color: "violet" },
        ].map((s) => (
          <div key={s.label} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              s.color === "cyan" ? "bg-cyan-500/10 border border-cyan-500/20" :
              s.color === "emerald" ? "bg-emerald-500/10 border border-emerald-500/20" :
              "bg-violet-500/10 border border-violet-500/20"
            }`}>
              <s.icon size={16} className={
                s.color === "cyan" ? "text-cyan-400" :
                s.color === "emerald" ? "text-emerald-400" : "text-violet-400"
              } />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchDocs} className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-400 hover:text-white hover:border-slate-600 transition-all">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl transition-colors"
          >
            <Plus size={14} />
            Ingest Document
          </button>
        </div>
      </div>

      <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/40">
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Filename</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Chunks</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Uploaded</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} className="border-b border-slate-700/20">
                  {[...Array(5)].map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-4 bg-slate-700/40 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center text-slate-500 text-sm">
                  <FileText size={28} className="mx-auto mb-3 opacity-30" />
                  No documents found in knowledge base
                </td>
              </tr>
            ) : (
              filtered.map((doc) => (
                <tr key={doc.id} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors group">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <FileText size={14} className="text-cyan-400 flex-shrink-0" />
                      <span className="text-sm text-white font-medium truncate max-w-[200px]">{doc.file_path || doc.title}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-slate-400 bg-slate-700/40 px-2 py-1 rounded-md">{doc.doc_type}</span>
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status="processed" /></td>
                  <td className="px-5 py-3.5 text-sm text-slate-300">{doc.chunk_count ?? "—"}</td>
                  <td className="px-5 py-3.5 text-sm text-slate-400">
                    {new Date(doc.uploaded_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Plants Tab ───────────────────────────────────────────────────────────────

function PowerPlantsTab() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiClient.get("/plants/")
      .then((res) => {
        const d = res.data;
        setPlants(d?.plants || d?.data || d?.results || (Array.isArray(d) ? d : []));
      })
      .catch(() => setPlants([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = plants.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.fuel_type || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.technology || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plants..."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
          />
        </div>
      </div>

      <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/40">
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Plant</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Fuel Type</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Technology</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Capacity</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Grid</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i} className="border-b border-slate-700/20">
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-700/40 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center text-slate-500 text-sm">
                  <Zap size={28} className="mx-auto mb-3 opacity-30" />
                  No power plants found
                </td>
              </tr>
            ) : (
              filtered.map((plant) => (
                <tr key={plant.id} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                        <Zap size={12} className="text-cyan-400" />
                      </div>
                      <span className="text-sm text-white font-medium">{plant.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-slate-400 bg-slate-700/40 px-2 py-1 rounded-md">{plant.fuel_type}</span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-400">{plant.technology}</td>
                  <td className="px-5 py-3.5 text-sm text-white font-medium">{plant.capacity_mw} <span className="text-slate-500 font-normal text-xs">MW</span></td>
                  <td className="px-5 py-3.5 text-sm text-slate-400">{plant.grid_voltage || "—"}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={plant.status?.toLowerCase() === "active" ? "active" : "inactive"} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Meters Tab ───────────────────────────────────────────────────────────────

function MetersTab() {
  const [meters, setMeters] = useState<Meter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiClient.get("/meters/")
      .then((res) => {
        const d = res.data;
        setMeters(d?.meters || d?.data || d?.results || (Array.isArray(d) ? d : []));
      })
      .catch(() => setMeters([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = meters.filter(
    (m) =>
      (m.meter_number || "").toLowerCase().includes(search.toLowerCase()) ||
      (m.plant_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meters..."
            className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
          />
        </div>
      </div>

      <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/40">
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Meter Code</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Plant</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Multiplier</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Direction</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i} className="border-b border-slate-700/20">
                  {[...Array(5)].map((_, j) => (
                    <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-700/40 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-16 text-center text-slate-500 text-sm">
                  <Activity size={28} className="mx-auto mb-3 opacity-30" />
                  No meters found
                </td>
              </tr>
            ) : (
              filtered.map((meter) => (
                <tr key={meter.id} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-mono text-cyan-300">{meter.meter_number}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-slate-400 bg-slate-700/40 px-2 py-1 rounded-md">{meter.meter_type}</span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-300">{meter.plant_name || `Plant #${meter.plant_id}`}</td>
                  <td className="px-5 py-3.5 text-sm text-slate-400">{meter.multiplier}x</td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-slate-400 bg-slate-700/40 px-2 py-1 rounded-md">{meter.direction}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "rag", label: "RAG Document Hub", icon: Database },
  { key: "plants", label: "Power Plants", icon: Zap },
  { key: "meters", label: "Meters", icon: Activity },
];

export default function MasterDataPage() {
  const [activeTab, setActiveTab] = useState<Tab>("rag");

  return (
    <div className="min-h-screen bg-[#0b1120] p-6 lg:p-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
          <Database size={20} className="text-cyan-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Master Data</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage plants, meters & AI knowledge base</p>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-slate-800/40 border border-slate-700/40 rounded-xl p-1 mb-6 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key
                ? "bg-cyan-600 text-white shadow-lg shadow-cyan-900/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === "rag" && <RagDocumentHub />}
        {activeTab === "plants" && <PowerPlantsTab />}
        {activeTab === "meters" && <MetersTab />}
      </div>
    </div>
  );
}