'use client';

/**
 * GridIntel — Shared UI Components
 * KpiCard, PageHeader, DataTable wrapper, LoadingSkeleton, EmptyState, StatusBadge
 */

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, AlertCircle, LucideIcon } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { cn, getStatusColor } from '@/lib/utils';

// ── KPI Card ──────────────────────────────────────────────────────────────

interface KpiCardProps {
  title:    string;
  value:    string | number;
  unit?:    string;
  icon:     LucideIcon;
  trend?:   number;      // % change, positive = up
  trendLabel?: string;
  color?:   'cyan' | 'green' | 'yellow' | 'red' | 'purple';
  loading?: boolean;
  onClick?: () => void;
}

const COLOR_MAP = {
  cyan:   { icon: 'text-cyan',          bg: 'bg-cyan/10',          border: 'border-cyan/20' },
  green:  { icon: 'text-status-success', bg: 'bg-status-success/10', border: 'border-status-success/20' },
  yellow: { icon: 'text-status-warning', bg: 'bg-status-warning/10', border: 'border-status-warning/20' },
  red:    { icon: 'text-status-error',   bg: 'bg-status-error/10',   border: 'border-status-error/20' },
  purple: { icon: 'text-status-locked',  bg: 'bg-status-locked/10',  border: 'border-status-locked/20' },
};

export function KpiCard({
  title, value, unit, icon: Icon, trend, trendLabel, color = 'cyan', loading, onClick,
}: KpiCardProps) {
  const colors = COLOR_MAP[color];

  if (loading) {
    return (
      <div className="kpi-card">
        <div className="shimmer h-4 w-24 rounded" />
        <div className="shimmer h-8 w-32 rounded mt-2" />
        <div className="shimmer h-3 w-20 rounded mt-1" />
      </div>
    );
  }

  return (
    <motion.div
      whileHover={onClick ? { y: -1 } : undefined}
      onClick={onClick}
      className={cn(
        'kpi-card group',
        onClick && 'cursor-pointer hover:border-cyan/30 hover:shadow-cyan-sm transition-all'
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', colors.bg)}>
          <Icon className={cn('w-4.5 h-4.5', colors.icon)} strokeWidth={2} />
        </div>
        {trend !== undefined && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-medium',
            trend > 0 ? 'text-status-success' : trend < 0 ? 'text-status-error' : 'text-text-muted'
          )}>
            {trend > 0
              ? <TrendingUp className="w-3 h-3" />
              : trend < 0
              ? <TrendingDown className="w-3 h-3" />
              : <Minus className="w-3 h-3" />
            }
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>

      <div>
        <div className="flex items-baseline gap-1 mt-3">
          <span className="num text-2xl font-bold text-text-primary">{value}</span>
          {unit && <span className="text-xs text-text-secondary">{unit}</span>}
        </div>
        <div className="text-xs text-text-secondary mt-0.5">{title}</div>
        {trendLabel && (
          <div className="text-2xs text-text-muted mt-1">{trendLabel}</div>
        )}
      </div>
    </motion.div>
  );
}

// ── Page Header ───────────────────────────────────────────────────────────

interface PageHeaderProps {
  title:       string;
  subtitle?:   string;
  actions?:    React.ReactNode;
  breadcrumb?: string[];
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div className="section-header">
      <div>
        {breadcrumb && (
          <div className="flex items-center gap-1.5 mb-1">
            {breadcrumb.map((crumb, i) => (
              <React.Fragment key={crumb}>
                {i > 0 && <span className="text-text-muted text-xs">/</span>}
                <span className={cn(
                  'text-xs',
                  i === breadcrumb.length - 1 ? 'text-text-secondary' : 'text-text-muted'
                )}>{crumb}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="text-sm text-text-secondary mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('badge capitalize', getStatusColor(status))}>
      {status}
    </span>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?:    LucideIcon;
  title:    string;
  message?: string;
  action?:  React.ReactNode;
}

export function EmptyState({ icon: Icon = AlertCircle, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-navy-card border border-navy-border flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-text-muted" />
      </div>
      <h3 className="text-sm font-medium text-text-secondary">{title}</h3>
      {message && <p className="text-xs text-text-muted mt-1 max-w-xs">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 px-3 py-2.5 border-b border-navy-border bg-navy-surface/50">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="shimmer h-3 rounded flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="flex gap-4 px-3 py-3 border-b border-navy-border/50">
          {Array.from({ length: cols }).map((_, ci) => (
            <div
              key={ci}
              className="shimmer h-3 rounded flex-1"
              style={{ opacity: 1 - ri * 0.08 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-${Math.min(count, 4)} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="kpi-card">
          <div className="shimmer h-9 w-9 rounded-lg" />
          <div className="shimmer h-7 w-28 rounded mt-3" />
          <div className="shimmer h-3 w-20 rounded mt-2" />
        </div>
      ))}
    </div>
  );
}

// ── Data Table ────────────────────────────────────────────────────────────

interface DataTableProps<TData> {
  data:      TData[];
  columns:   ColumnDef<TData, unknown>[];
  loading?:  boolean;
  pageSize?: number;
  searchable?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData>({
  data, columns, loading, pageSize = 20, searchable, emptyMessage, onRowClick,
}: DataTableProps<TData>) {
  const [sorting,      setSorting]      = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel:       getCoreRowModel(),
    getSortedRowModel:     getSortedRowModel(),
    getFilteredRowModel:   getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { sorting, globalFilter },
    onSortingChange:      setSorting,
    onGlobalFilterChange: setGlobalFilter,
    initialState: { pagination: { pageSize } },
  });

  if (loading) return <TableSkeleton cols={columns.length} />;

  return (
    <div className="card overflow-hidden">
      {searchable && (
        <div className="p-3 border-b border-navy-border">
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search…"
            className="input max-w-xs"
          />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table-grid">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={cn(header.column.getCanSort() && 'cursor-pointer select-none')}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc'  && ' ↑'}
                      {header.column.getIsSorted() === 'desc' && ' ↓'}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-text-muted text-sm">
                  {emptyMessage ?? 'No data available'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-3 py-2.5 border-t border-navy-border">
          <span className="text-xs text-text-muted">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            {' · '}
            {table.getFilteredRowModel().rows.length} rows
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="btn-ghost btn-sm disabled:opacity-30"
            >
              ←
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="btn-ghost btn-sm disabled:opacity-30"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
