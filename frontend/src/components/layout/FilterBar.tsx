'use client';

/**
 * GridIntel — Global FilterBar
 * Month / Year / Office / Company selectors that persist in filterStore.
 */

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Building2, Zap } from 'lucide-react';
import { cn, MONTH_NAMES } from '@/lib/utils';
import { useFilterStore } from '@/store/global_stores';
import apiClient from '@/lib/api_client';

interface Office { id: string; name: string; }
interface Company { id: string; name: string; }

export function FilterBar() {
  const { month, year, officeId, companyId, setMonth, setYear, setOfficeId, setCompanyId } =
    useFilterStore();

  const [offices,   setOffices]   = useState<Office[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    apiClient.get<Office[]>('/offices/').then((r) => setOffices(r.data)).catch(() => {});
    apiClient.get<Company[]>('/companies/').then((r) => setCompanies(r.data)).catch(() => {});
  }, []);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    const now = new Date();
    if (year === now.getFullYear() && month === now.getMonth() + 1) return;
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  }

  const canGoNext = (() => {
    const now = new Date();
    return !(year === now.getFullYear() && month === now.getMonth() + 1);
  })();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* ── Month / Year navigator ─────────────────────────── */}
      <div className="flex items-center gap-1 bg-navy-card border border-navy-border rounded px-1">
        <button
          onClick={prevMonth}
          className="p-1 rounded hover:bg-navy-hover text-text-secondary hover:text-text-primary transition-colors"
          title="Previous month"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-1 px-1">
          {/* Month select */}
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="bg-transparent text-sm text-text-primary font-medium focus:outline-none cursor-pointer appearance-none"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1} className="bg-navy-card">
                {name}
              </option>
            ))}
          </select>
          {/* Year select */}
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-transparent text-sm text-text-primary font-medium focus:outline-none cursor-pointer appearance-none"
          >
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i - 2).map((y) => (
              <option key={y} value={y} className="bg-navy-card">{y}</option>
            ))}
          </select>
        </div>

        <button
          onClick={nextMonth}
          disabled={!canGoNext}
          className={cn(
            'p-1 rounded transition-colors',
            canGoNext
              ? 'hover:bg-navy-hover text-text-secondary hover:text-text-primary'
              : 'text-text-muted cursor-not-allowed opacity-40'
          )}
          title="Next month"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Office filter ──────────────────────────────────── */}
      {offices.length > 0 && (
        <div className="flex items-center gap-1.5 bg-navy-card border border-navy-border rounded px-2.5 py-1.5">
          <Building2 className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          <select
            value={officeId ?? ''}
            onChange={(e) => setOfficeId(e.target.value || null)}
            className="bg-transparent text-sm text-text-secondary focus:outline-none cursor-pointer appearance-none min-w-[120px]"
          >
            <option value="" className="bg-navy-card">All Offices</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id} className="bg-navy-card">{o.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Company filter ─────────────────────────────────── */}
      {companies.length > 0 && (
        <div className="flex items-center gap-1.5 bg-navy-card border border-navy-border rounded px-2.5 py-1.5">
          <Zap className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          <select
            value={companyId ?? ''}
            onChange={(e) => setCompanyId(e.target.value || null)}
            className="bg-transparent text-sm text-text-secondary focus:outline-none cursor-pointer appearance-none min-w-[120px]"
          >
            <option value="" className="bg-navy-card">All Companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id} className="bg-navy-card">{c.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
