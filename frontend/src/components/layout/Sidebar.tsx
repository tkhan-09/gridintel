'use client';

/**
 * GridIntel — Sidebar Navigation
 * Full nav: OPERATIONS, BILLING, ANALYTICS, SYSTEM sections
 * Collapsible with icon-only mode.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, LayoutDashboard, Factory, Gauge, ClipboardList, CheckSquare,
  ArrowLeftRight, BookOpen, BarChart2, FileText, Sliders, TrendingUp,
  TrendingDown, Activity, Users, Shield, Bot, Settings, ChevronLeft,
  ChevronRight, DollarSign, Receipt, AlertTriangle, Fuel, PieChart,
  Layers, Database, Landmark,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/global_stores';

// ── Nav structure ─────────────────────────────────────────────────────────

interface NavItem {
  href:      string;
  label:     string;
  icon:      React.ElementType;
  roles?:    string[];
  badge?:    string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'OPERATIONS',
    items: [
      { href: '/dashboard',           label: 'Dashboard',             icon: LayoutDashboard },
      { href: '/plants',              label: 'Power Plants',          icon: Factory },
      { href: '/meters',              label: 'Meters',                icon: Gauge },
      { href: '/mod-entry',           label: 'MOD Entry',             icon: ClipboardList, roles: ['SuperAdmin','Admin','Operator'] },
      { href: '/submission',          label: 'Submissions',           icon: CheckSquare },
      { href: '/generation-management', label: 'Generation Mgmt',    icon: Zap },
      { href: '/cross-border',        label: 'Cross-Border',          icon: ArrowLeftRight },
    ],
  },
  {
    title: 'BILLING',
    items: [
      { href: '/energy-accounting',   label: 'Energy Accounting',     icon: BookOpen },
      { href: '/utility-sales',       label: 'Utility Sales',         icon: BarChart2 },
      { href: '/billing',             label: 'Invoices',              icon: Receipt, roles: ['SuperAdmin','Admin','Auditor'] },
      { href: '/invoice-management',  label: 'Invoice Management',    icon: FileText, roles: ['SuperAdmin','Admin','Auditor'] },
      { href: '/adjustments',         label: 'Adjustments',           icon: Sliders, roles: ['SuperAdmin','Admin'] },
      { href: '/outstanding-bills',   label: 'Outstanding Bills',     icon: AlertTriangle, roles: ['SuperAdmin','Admin','Auditor'] },
      { href: '/revenue-tracking',    label: 'Revenue Tracking',      icon: DollarSign, roles: ['SuperAdmin','Admin','Auditor'] },
    ],
  },
  {
    title: 'ANALYTICS',
    items: [
      { href: '/analytics/office',    label: 'Office KPIs',           icon: Landmark },
      { href: '/analytics/company',   label: 'Company Analysis',      icon: PieChart },
      { href: '/analytics/fuel',      label: 'Fuel Analysis',         icon: Fuel },
      { href: '/analytics/voltage',   label: 'Voltage Analysis',      icon: Activity },
      { href: '/analytics/loss',      label: 'Loss Analysis',         icon: TrendingDown },
      { href: '/fuel-management',     label: 'Fuel Management',       icon: Database },
      { href: '/reports',             label: 'Reports',               icon: Layers },
      { href: '/import',              label: 'Import Data',           icon: TrendingUp },
    ],
  },
  {
    title: 'SYSTEM',
    items: [
      { href: '/users',               label: 'Users',                 icon: Users,  roles: ['SuperAdmin','Admin'] },
      { href: '/audit',               label: 'Audit Log',             icon: Shield, roles: ['SuperAdmin','Admin','Auditor'] },
      { href: '/master-data',         label: 'Master Data',           icon: Database, roles: ['SuperAdmin','Admin'] },
      { href: '/ai-copilot',          label: 'AI Copilot',            icon: Bot },
      { href: '/settings',            label: 'Settings',              icon: Settings, roles: ['SuperAdmin','Admin'] },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed:        boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const pathname  = usePathname();
  const { user }  = useAuthStore();
  const userRole  = user?.role ?? 'Viewer';

  const visibleSections = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => !item.roles || item.roles.includes(userRole)
        ),
      })).filter((s) => s.items.length > 0),
    [userRole]
  );

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen z-40 flex flex-col',
        'bg-navy-surface border-r border-navy-border',
        'transition-all duration-300 ease-bounce-out overflow-hidden',
        collapsed ? 'w-16' : 'w-[260px]'
      )}
    >
      {/* ── Logo ──────────────────────────────────────────────── */}
      <div className="flex items-center h-[60px] px-4 border-b border-navy-border flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Icon */}
          <div className="w-8 h-8 rounded bg-cyan/10 border border-cyan/30 flex items-center justify-center flex-shrink-0 shadow-cyan-sm">
            <Zap className="w-4 h-4 text-cyan" strokeWidth={2.5} />
          </div>
          {/* Wordmark */}
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="font-display font-bold text-lg text-text-primary leading-none">
                  Grid<span className="text-cyan">Intel</span>
                </div>
                <div className="text-2xs text-text-muted tracking-widest uppercase mt-0.5">
                  BPDB Platform
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Nav items ─────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-thin">
        {visibleSections.map((section) => (
          <div key={section.title}>
            {/* Section label */}
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="nav-section"
                >
                  {section.title}
                </motion.div>
              )}
            </AnimatePresence>
            {collapsed && <div className="h-3" />}

            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href} className="block px-2 mb-0.5">
                  <div
                    className={cn(
                      'nav-link',
                      collapsed ? 'justify-center px-0 py-2.5' : '',
                      active && 'active'
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon
                      className={cn(
                        'w-4 h-4 flex-shrink-0',
                        active ? 'text-cyan' : 'text-text-secondary'
                      )}
                      strokeWidth={active ? 2.5 : 2}
                    />
                    <AnimatePresence>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -4 }}
                          transition={{ duration: 0.15 }}
                          className="truncate"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {/* Active indicator */}
                    {active && !collapsed && (
                      <div className="ml-auto w-1 h-4 rounded-full bg-cyan" />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── User info + collapse toggle ────────────────────────── */}
      <div className="border-t border-navy-border p-3 flex-shrink-0">
        {!collapsed && user && (
          <div className="flex items-center gap-3 px-1 mb-3">
            <div className="w-8 h-8 rounded-full bg-cyan/10 border border-cyan/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-cyan">
                {user.full_name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-primary truncate">{user.full_name}</div>
              <div className="text-2xs text-text-muted truncate">{user.role}</div>
            </div>
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="w-full btn-ghost rounded justify-center py-2 text-text-muted hover:text-text-primary"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRight className="w-4 h-4" />
            : <><ChevronLeft className="w-4 h-4" /><span className="text-xs ml-1">Collapse</span></>
          }
        </button>
      </div>
    </aside>
  );
}
