'use client';

/**
 * GridIntel — Topbar
 * Dynamic page title, global FilterBar, NotificationBell, user menu.
 */

import React, { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, LogOut, User, ChevronDown, ChevronLeft, ChevronRight,
  Search, Settings,
} from 'lucide-react';
import { cn, MONTH_NAMES, recentMonths } from '@/lib/utils';
import { useAuthStore, useFilterStore, useAlertStore } from '@/store/global_stores';
import { NotificationBell } from './NotificationBell';
import { FilterBar } from './FilterBar';

// ── Page title map ────────────────────────────────────────────────────────

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':               'Dashboard',
  '/plants':                  'Power Plants',
  '/meters':                  'Meters',
  '/mod-entry':               'MOD Entry',
  '/submission':              'Submission Status',
  '/generation-management':   'Generation Management',
  '/cross-border':            'Cross-Border Circuits',
  '/energy-accounting':       'Energy Accounting',
  '/utility-sales':           'Utility Sales',
  '/billing':                 'Invoices',
  '/invoice-management':      'Invoice Management',
  '/adjustments':             'Adjustments',
  '/outstanding-bills':       'Outstanding Bills',
  '/revenue-tracking':        'Revenue Tracking',
  '/analytics/office':        'Office KPIs',
  '/analytics/company':       'Company Analysis',
  '/analytics/fuel':          'Fuel Analysis',
  '/analytics/voltage':       'Voltage Analysis',
  '/analytics/loss':          'Loss Analysis',
  '/fuel-management':         'Fuel Management',
  '/reports':                 'Reports',
  '/import':                  'Import Data',
  '/users':                   'User Management',
  '/audit':                   'Audit Log',
  '/master-data':             'Master Data',
  '/ai-copilot':              'AI Copilot',
  '/settings':                'System Settings',
};

function getPageTitle(pathname: string): string {
  // Exact match
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Prefix match
  for (const [prefix, label] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(prefix)) return label;
  }
  return 'GridIntel';
}

// ── Pages that show the global FilterBar ─────────────────────────────────

const FILTER_PAGES = [
  '/dashboard', '/mod-entry', '/submission', '/energy-accounting',
  '/utility-sales', '/billing', '/cross-border', '/analytics',
  '/generation-management', '/revenue-tracking', '/outstanding-bills',
  '/invoice-management', '/reports',
];

function showsFilter(pathname: string): boolean {
  return FILTER_PAGES.some((p) => pathname.startsWith(p));
}

// ── Topbar ────────────────────────────────────────────────────────────────

interface TopbarProps {
  sidebarCollapsed: boolean;
}

export function Topbar({ sidebarCollapsed }: TopbarProps) {
  const pathname        = usePathname();
  const router          = useRouter();
  const { user, logout } = useAuthStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const pageTitle = getPageTitle(pathname);
  const showFilter = showsFilter(pathname);

  // Close user menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleLogout() {
    document.cookie = "gridintel-auth=; path=/; max-age=0";
    logout();
    router.push('/login');
  }

  return (
    <header
      className={cn(
        'h-[60px] flex items-center gap-4 px-5',
        'bg-navy-surface border-b border-navy-border',
        'flex-shrink-0 z-20 sticky top-0'
      )}
    >
      {/* Page title */}
      <div className="min-w-0 flex-shrink-0">
        <h1 className="font-display text-lg font-semibold text-text-primary leading-none">
          {pageTitle}
        </h1>
      </div>

      {/* Divider */}
      {showFilter && <div className="w-px h-6 bg-navy-border flex-shrink-0" />}

      {/* Global FilterBar */}
      {showFilter && (
        <div className="flex-1 min-w-0">
          <FilterBar />
        </div>
      )}

      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Notification Bell */}
        <NotificationBell />

        {/* User menu */}
        <div ref={userMenuRef} className="relative">
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className={cn(
              'flex items-center gap-2 pl-2 pr-3 py-1.5 rounded',
              'text-text-secondary hover:text-text-primary hover:bg-navy-hover',
              'transition-colors text-sm font-medium'
            )}
          >
            <div className="w-7 h-7 rounded-full bg-cyan/10 border border-cyan/20 flex items-center justify-center">
              <span className="text-xs font-semibold text-cyan">
                {user?.full_name.charAt(0) ?? '?'}
              </span>
            </div>
            <span className="hidden sm:block max-w-[140px] truncate">
              {user?.full_name ?? 'User'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full mt-2 w-56 card shadow-panel z-50"
              >
                <div className="p-3 border-b border-navy-border">
                  <div className="text-sm font-medium text-text-primary">{user?.full_name}</div>
                  <div className="text-xs text-text-muted mt-0.5">{user?.email}</div>
                  <div className="mt-1.5">
                    <span className="badge bg-cyan/10 text-cyan text-2xs">{user?.role}</span>
                    {user?.office_name && (
                      <span className="badge bg-navy-border text-text-secondary text-2xs ml-1.5">
                        {user.office_name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-1.5">
                  <button
                    onClick={() => { router.push('/settings'); setUserMenuOpen(false); }}
                    className="nav-link w-full"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="nav-link w-full text-status-error hover:text-status-error hover:bg-status-error/10"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

