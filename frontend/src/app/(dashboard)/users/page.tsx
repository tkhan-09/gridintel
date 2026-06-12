'use client';
import { useState, useEffect } from 'react';
import apiClient from '@/lib/api_client';
import { useAuthStore } from '@/store/authStore';

const ROLES = ['super_admin', 'admin', 'operator', 'engineer', 'viewer'];

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-500/20 text-red-400 border border-red-500/30',
  admin: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  operator: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  engineer: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  viewer: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
};

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string | null;
}

interface UserForm {
  username: string;
  email: string;
  password: string;
  role: string;
}

const emptyForm: UserForm = { username: '', email: '', password: '', role: 'viewer' };

export default function UsersPage() {
  const token = useAuthStore((s: any) => s.token);
  const currentUser = useAuthStore((s: any) => s.user);

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [resetUser, setResetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/users/', { headers });
      setUsers(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = users.filter(u => {
    const matchSearch = u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole ? u.role === filterRole : true;
    const matchStatus = filterStatus === 'active' ? u.is_active :
      filterStatus === 'inactive' ? !u.is_active : true;
    return matchSearch && matchRole && matchStatus;
  });

  const total = users.length;
  const active = users.filter(u => u.is_active).length;
  const inactive = total - active;

  const openCreate = () => {
    setEditUser(null);
    setForm(emptyForm);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({ username: u.username, email: u.email, password: '', role: u.role });
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async () => {
    setFormLoading(true);
    setFormError('');
    try {
      if (editUser) {
        const payload: any = { username: form.username, email: form.email, role: form.role };
        await apiClient.put(`/users/${editUser.id}`, payload, { headers });
      } else {
        await apiClient.post('/users/', form, { headers });
      }
      setShowModal(false);
      fetchUsers();
    } catch (e: any) {
      setFormError(e?.response?.data?.detail || 'Error occurred');
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (u: User) => {
    try {
      if (u.is_active) {
        await apiClient.delete(`/users/${u.id}`, { headers });
      } else {
        await apiClient.post(`/users/${u.id}/activate`, {}, { headers });
      }
      fetchUsers();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setDeleteLoading(true);
    try {
      await apiClient.delete(`/users/${deleteUser.id}`, { headers });
      setDeleteUser(null);
      fetchUsers();
    } catch (e) { console.error(e); } finally { setDeleteLoading(false); }
  };

  const handleReset = async () => {
    if (!resetUser || !newPassword) return;
    setResetLoading(true);
    setResetError('');
    try {
      await apiClient.put(`/users/${resetUser.id}`, { password: newPassword }, { headers });
      setResetUser(null);
      setNewPassword('');
    } catch (e: any) {
      setResetError(e?.response?.data?.detail || 'Error occurred');
    } finally { setResetLoading(false); }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-gray-400 text-sm mt-1">Manage system users and permissions</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-lg transition-colors text-sm">
          + Add User
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Users', value: total, color: 'text-white' },
          { label: 'Active', value: active, color: 'text-green-400' },
          { label: 'Inactive', value: inactive, color: 'text-red-400' },
        ].map(c => (
          <div key={c.label} className="bg-[#0d1b2e] border border-white/10 rounded-xl p-4 text-center">
            <p className={`text-3xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-gray-400 text-sm mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="bg-[#0d1b2e] border border-white/10 text-white text-sm rounded-lg px-4 py-2 w-64 focus:outline-none focus:border-cyan-500" />
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="bg-[#0d1b2e] border border-white/10 text-white text-sm rounded-lg px-4 py-2 focus:outline-none focus:border-cyan-500">
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-[#0d1b2e] border border-white/10 text-white text-sm rounded-lg px-4 py-2 focus:outline-none focus:border-cyan-500">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#0d1b2e] border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400 text-xs uppercase">
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Created</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">No users found</td></tr>
            ) : filtered.map(u => (
              <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xs">
                      {u.username[0].toUpperCase()}
                    </div>
                    <span className="text-white font-medium">{u.username}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-300">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-md text-xs font-medium ${ROLE_COLORS[u.role] || ROLE_COLORS['viewer']}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => handleToggleActive(u)}
                    disabled={u.username === currentUser?.username}
                    className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${u.is_active
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(u)}
                      className="px-3 py-1 text-xs bg-white/5 hover:bg-white/10 text-gray-300 rounded-md transition-colors border border-white/10">
                      Edit
                    </button>
                    <button onClick={() => { setResetUser(u); setNewPassword(''); setResetError(''); }}
                      className="px-3 py-1 text-xs bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-md transition-colors border border-yellow-500/20">
                      Reset PW
                    </button>
                    <button onClick={() => setDeleteUser(u)}
                      disabled={u.username === currentUser?.username}
                      className="px-3 py-1 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md transition-colors border border-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0d1b2e] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-5">{editUser ? 'Edit User' : 'Add New User'}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Username</label>
                <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                  className="w-full bg-[#060d18] border border-white/10 text-white text-sm rounded-lg px-4 py-2 focus:outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Email</label>
                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-[#060d18] border border-white/10 text-white text-sm rounded-lg px-4 py-2 focus:outline-none focus:border-cyan-500" />
              </div>
              {!editUser && (
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Password</label>
                  <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-[#060d18] border border-white/10 text-white text-sm rounded-lg px-4 py-2 focus:outline-none focus:border-cyan-500" />
                </div>
              )}
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Role</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                  className="w-full bg-[#060d18] border border-white/10 text-white text-sm rounded-lg px-4 py-2 focus:outline-none focus:border-cyan-500">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {formError && <p className="text-red-400 text-xs">{formError}</p>}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={formLoading}
                className="px-4 py-2 text-sm bg-cyan-500 hover:bg-cyan-400 text-black font-semibold rounded-lg transition-colors disabled:opacity-50">
                {formLoading ? 'Saving...' : editUser ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0d1b2e] border border-white/10 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-2">Deactivate User</h2>
            <p className="text-gray-400 text-sm mb-6">
              Are you sure you want to deactivate <span className="text-white font-medium">{deleteUser.username}</span>?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteUser(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={deleteLoading}
                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-400 text-white font-semibold rounded-lg transition-colors disabled:opacity-50">
                {deleteLoading ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0d1b2e] border border-white/10 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-2">Reset Password</h2>
            <p className="text-gray-400 text-sm mb-4">Set new password for <span className="text-white font-medium">{resetUser.username}</span></p>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              placeholder="New password..."
              className="w-full bg-[#060d18] border border-white/10 text-white text-sm rounded-lg px-4 py-2 focus:outline-none focus:border-cyan-500 mb-2" />
            {resetError && <p className="text-red-400 text-xs mb-2">{resetError}</p>}
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setResetUser(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleReset} disabled={resetLoading || !newPassword}
                className="px-4 py-2 text-sm bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg transition-colors disabled:opacity-50">
                {resetLoading ? 'Saving...' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}