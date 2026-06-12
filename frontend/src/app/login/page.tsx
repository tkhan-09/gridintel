'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Zap, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/global_stores';
import apiClient from '@/lib/api_client';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface LoginResponse {
  access_token:  string;
  refresh_token: string;
  user: {
    id: string;
    username: string;
    full_name: string;
    email: string;
    role: 'SuperAdmin' | 'Admin' | 'Operator' | 'Auditor' | 'Viewer';
    office_id:   string | null;
    office_name: string | null;
    is_active: boolean;
  };
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, setLoading } = useAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await apiClient.post<LoginResponse>('/auth/login', {
        username,
        password,
      });
      const user = {
        id: String(data.user_id),
        username: data.username,
        email: data.username,
        full_name: data.username,
        role: data.role === 'super_admin' ? 'SuperAdmin' :
              data.role === 'admin' ? 'Admin' :
              data.role === 'operator' ? 'Operator' :
              data.role === 'viewer' ? 'Viewer' : 'Admin',
        office_id: data.office_id ? String(data.office_id) : null,
        office_name: data.office_name ?? null,
        is_active: true,
      };
      login(user, data.access_token, data.refresh_token);
      document.cookie = `gridintel-auth=${data.access_token}; path=/; max-age=86400`;
      toast.success(`Welcome, ${user.username}`);
      router.replace('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Invalid credentials';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-navy-bg flex items-center justify-center p-4 bg-grid-pattern">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-cyan/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-[400px] relative"
      >
        {/* Card */}
        <div className="card p-8 shadow-panel border-navy-border">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-xl bg-cyan/10 border border-cyan/30 flex items-center justify-center mb-4 shadow-cyan">
              <Zap className="w-7 h-7 text-cyan" strokeWidth={2.5} />
            </div>
            <h1 className="font-display text-2xl font-bold text-text-primary">
              Grid<span className="text-cyan">Intel</span>
            </h1>
            <p className="text-text-secondary text-sm mt-1">Power Intelligence Platform</p>
            <p className="text-text-muted text-xs mt-0.5 tracking-wider uppercase">BPDB Edition</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="Enter username"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <a href="/forgot-password" className="text-xs text-cyan hover:text-cyan-light transition-colors">
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full justify-center py-2.5 mt-2"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 p-3 rounded bg-navy-surface border border-navy-border">
            <p className="text-2xs text-text-muted font-medium uppercase tracking-wider mb-2">Demo Credentials</p>
            <div className="space-y-1">
              {[
                { role: 'SuperAdmin', user: 'superadmin', pw: 'Admin@123' },
                { role: 'Operator',   user: 'operator1',  pw: 'Op@123456' },
              ].map((d) => (
                <button
                  key={d.role}
                  type="button"
                  onClick={() => { setUsername(d.user); setPassword(d.pw); }}
                  className={cn(
                    'w-full text-left px-2 py-1 rounded text-xs',
                    'hover:bg-navy-hover transition-colors',
                    'text-text-secondary hover:text-text-primary'
                  )}
                >
                  <span className="badge bg-cyan/10 text-cyan text-2xs mr-2">{d.role}</span>
                  {d.user} / {d.pw}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-text-muted text-xs mt-4">
          GridIntel v1.0 · Bangladesh Power Development Board
        </p>
      </motion.div>
    </div>
  );
}

