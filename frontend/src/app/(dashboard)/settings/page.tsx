"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Users,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  Edit2,
  X,
  ChevronDown,
  AlertTriangle,
  Lock,
  CheckCircle,
  Clock,
  UserCog,
  Key,
  Eye,
  EyeOff,
  Crown,
} from "lucide-react";
import { apiClient } from "@/lib/api_client";
import { useAuthStore } from "@/store/global_stores";

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

interface CreateUserPayload {
  username: string;
  full_name: string;
  email: string;
  password: string;
  role: string;
}

const ROLES = [
  { value: "superadmin", label: "Super Admin", color: "amber", description: "Full system access" },
  { value: "admin", label: "Admin", color: "cyan", description: "Administrative access" },
  { value: "operator", label: "Operator", color: "violet", description: "Operational access" },
  { value: "viewer", label: "Viewer", color: "slate", description: "Read-only access" },
];

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const r = ROLES.find((x) => x.value === role);
  const colorMap: Record<string, string> = {
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    violet: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    slate: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };
  const cls = colorMap[r?.color || "slate"] ?? colorMap.slate;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cls}`}>
      {role === "superadmin" && <Crown size={10} />}
      {r?.label ?? role}
    </span>
  );
}

// ─── Create Account Modal ─────────────────────────────────────────────────────

function CreateAccountModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<CreateUserPayload>({
    username: "",
    full_name: "",
    email: "",
    password: "",
    role: "operator",
  });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof CreateUserPayload) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.username || !form.password || !form.full_name) {
      setError("Username, full name and password are required.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiClient.post("/users/", form);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to create account.");
    } finally {
      setLoading(false);
    }
  };

  const fields: { key: keyof CreateUserPayload; label: string; placeholder: string; type?: string }[] = [
    { key: "full_name", label: "Full Name", placeholder: "e.g. Md. Rahim Uddin" },
    { key: "username", label: "Username", placeholder: "e.g. rahim.uddin" },
    { key: "email", label: "Email", placeholder: "e.g. rahim@bpdb.gov.bd", type: "email" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60 bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <UserCog size={15} className="text-cyan-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Create New Account</h3>
              <p className="text-slate-500 text-xs">Add a new system user</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-700">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {fields.map(({ key, label, placeholder, type }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
              <input
                type={type || "text"}
                value={form[key]}
                onChange={set(key)}
                placeholder={placeholder}
                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition-colors"
              />
            </div>
          ))}

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={form.password}
                onChange={set("password")}
                placeholder="Min. 6 characters"
                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 pr-10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Role</label>
            <div className="relative">
              <select
                value={form.role}
                onChange={set("role")}
                className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-cyan-500/60 transition-colors"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label} — {r.description}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertTriangle size={12} /> {error}
            </p>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Creating...</> : <><Plus size={14} /> Create Account</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Role Modal ──────────────────────────────────────────────────────────

function EditRoleModal({ user, onClose, onSuccess }: { user: User; onClose: () => void; onSuccess: () => void }) {
  const [role, setRole] = useState(user.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setLoading(true);
    setError("");
    try {
      await apiClient.put(`/users/${user.id}`, { role });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to update role.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
          <h3 className="text-white font-semibold text-sm">Edit Role — {user.username}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="relative">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-4 py-2.5 text-white text-sm appearance-none focus:outline-none focus:border-cyan-500/60 transition-colors"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors">Cancel</button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Key size={14} />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Access Denied Guard ──────────────────────────────────────────────────────

function AccessDenied() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-[#0b1120] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
          <Lock size={28} className="text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-slate-400 text-sm mb-6">
          You don't have permission to access the Admin Control Panel. Only <span className="text-amber-400 font-medium">Super Admins</span> can manage user accounts.
        </p>
        <button
          onClick={() => router.back()}
          className="px-5 py-2.5 text-sm font-medium text-white bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors"
        >
          Go Back
        </button>
      </div>
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [roleFilter, setRoleFilter] = useState("all");

  // ── Security gate: only superadmin ──
  if (currentUser?.role?.toLowerCase() !== "superadmin") {
    return <AccessDenied />;
  }

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/users/");
      const d = res.data;
      setUsers(d?.users || d?.data || d?.results || (Array.isArray(d) ? d : []));
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { fetchUsers(); }, []);

  const handleDelete = async (id: number, username: string) => {
    if (!confirm(`Permanently delete account "${username}"? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/users/${id}`);
      fetchUsers();
    } catch {}
  };

  const filtered = users.filter((u) => {
    const matchSearch =
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const stats = {
    total: users.length,
    active: users.filter((u) => u.is_active).length,
    admins: users.filter((u) => u.role === "superadmin" || u.role === "admin").length,
  };

  return (
    <div className="min-h-screen bg-[#0b1120] p-6 lg:p-8">
      {showCreate && <CreateAccountModal onClose={() => setShowCreate(false)} onSuccess={fetchUsers} />}
      {editUser && <EditRoleModal user={editUser} onClose={() => setEditUser(null)} onSuccess={fetchUsers} />}

      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <ShieldCheck size={20} className="text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white">Admin Control Panel</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Crown size={9} /> SuperAdmin Only
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-0.5">Manage system users, roles & access control</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Users", value: stats.total, icon: Users, color: "cyan" },
          { label: "Active Users", value: stats.active, icon: CheckCircle, color: "emerald" },
          { label: "Admins", value: stats.admins, icon: ShieldCheck, color: "amber" },
        ].map((s) => (
          <div key={s.label} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              s.color === "cyan" ? "bg-cyan-500/10 border border-cyan-500/20" :
              s.color === "emerald" ? "bg-emerald-500/10 border border-emerald-500/20" :
              "bg-amber-500/10 border border-amber-500/20"
            }`}>
              <s.icon size={16} className={
                s.color === "cyan" ? "text-cyan-400" :
                s.color === "emerald" ? "text-emerald-400" : "text-amber-400"
              } />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
          </div>
          {/* Role filter */}
          <div className="relative">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-slate-800/60 border border-slate-700/60 rounded-xl pl-3 pr-8 py-2.5 text-sm text-slate-300 appearance-none focus:outline-none focus:border-cyan-500/50 transition-colors"
            >
              <option value="all">All Roles</option>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchUsers} className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-400 hover:text-white hover:border-slate-600 transition-all">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl transition-colors shadow-lg shadow-cyan-900/20"
          >
            <Plus size={14} />
            Create Account
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl overflow-hidden">
        {/* Count bar */}
        <div className="px-5 py-3 border-b border-slate-700/40 flex items-center justify-between">
          <p className="text-sm text-slate-400">
            <span className="text-white font-medium">{filtered.length}</span> {filtered.length === 1 ? "user" : "users"} registered
          </p>
          {search && (
            <button onClick={() => setSearch("")} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors">
              <X size={11} /> Clear search
            </button>
          )}
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/40">
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">User</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Username</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Role</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Created</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Last Login</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i} className="border-b border-slate-700/20">
                  {[...Array(7)].map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-4 bg-slate-700/40 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center">
                  <Users size={28} className="mx-auto mb-3 text-slate-600" />
                  <p className="text-slate-500 text-sm">No users found</p>
                  <p className="text-slate-600 text-xs mt-1">
                    {search ? "Try a different search term." : "Create the first account to get started."}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className={`border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors group ${isSelf ? "bg-cyan-500/5" : ""}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-slate-600/50 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-slate-300">
                            {u.full_name?.charAt(0)?.toUpperCase() || u.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm text-white font-medium flex items-center gap-1.5">
                            {u.full_name || u.username}
                            {isSelf && <span className="text-xs text-cyan-400 font-normal">(you)</span>}
                          </p>
                          <p className="text-xs text-slate-500">{u.email || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-mono text-slate-300">@{u.username}</span>
                    </td>
                    <td className="px-5 py-3.5"><RoleBadge role={u.role} /></td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                        u.is_active
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                      }`}>
                        {u.is_active ? <><CheckCircle size={11} /> Active</> : <><Clock size={11} /> Inactive</>}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-400">
                      {new Date(u.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-400">
                      {u.last_login
                        ? new Date(u.last_login).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                        : <span className="text-slate-600">Never</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditUser(u)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
                          title="Edit role"
                        >
                          <Edit2 size={13} />
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => handleDelete(u.id, u.username)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            title="Delete account"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}