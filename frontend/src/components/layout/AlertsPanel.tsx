'use client';

/**
 * GridIntel — AlertsPanel
 * Sliding sheet from the right that shows live database anomaly alerts
 * pushed via WebSocket and retrieved from the notifications API.
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Bell, CheckCheck, AlertTriangle, AlertCircle, Info,
  Zap, Clock, RefreshCw,
} from 'lucide-react';
import { cn, getSeverityColor } from '@/lib/utils';
import { useAlertStore, Alert } from '@/store/global_stores';
import { formatDistanceToNow } from 'date-fns';
import apiClient from '@/lib/api_client';

// ── Alert item component ──────────────────────────────────────────────────

function AlertItem({ alert }: { alert: Alert }) {
  const { markRead, removeAlert } = useAlertStore();

  const Icon = (() => {
    if (alert.type === 'anomaly')  return AlertTriangle;
    if (alert.type === 'deadline') return Clock;
    if (alert.type === 'system')   return AlertCircle;
    return Info;
  })();

  const iconColor = {
    low:      'text-status-info',
    medium:   'text-status-warning',
    high:     'text-status-error',
    critical: 'text-red-400',
  }[alert.severity] ?? 'text-text-secondary';

  async function handleRead() {
    try {
      await apiClient.put(`/notifications/${alert.id}/read`);
    } catch { /* optimistic */ }
    markRead(alert.id);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0, padding: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'p-3 rounded-lg border transition-colors group',
        alert.read
          ? 'bg-navy-card/50 border-navy-border/50'
          : 'bg-navy-card border-navy-border hover:border-cyan/20'
      )}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div
          className={cn(
            'w-7 h-7 rounded flex items-center justify-center flex-shrink-0 mt-0.5',
            !alert.read && `bg-${iconColor.split('-')[1]}/10`
          )}
        >
          <Icon className={cn('w-3.5 h-3.5', iconColor)} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-medium text-text-primary leading-snug">
              {alert.title}
            </div>
            {/* Severity badge */}
            <span
              className={cn(
                'badge text-2xs flex-shrink-0',
                {
                  low:      'bg-status-info/10 text-status-info',
                  medium:   'bg-status-warning/10 text-status-warning',
                  high:     'bg-status-error/10 text-status-error',
                  critical: 'bg-red-500/10 text-red-400',
                }[alert.severity]
              )}
            >
              {alert.severity}
            </span>
          </div>

          <p className="text-xs text-text-secondary mt-1 leading-relaxed">{alert.message}</p>

          {alert.plant_name && (
            <div className="flex items-center gap-1 mt-1.5">
              <Zap className="w-3 h-3 text-cyan" />
              <span className="text-2xs text-text-muted">{alert.plant_name}</span>
            </div>
          )}

          <div className="flex items-center justify-between mt-2">
            <span className="text-2xs text-text-muted">
              {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!alert.read && (
                <button
                  onClick={handleRead}
                  className="text-2xs text-cyan hover:text-cyan-light transition-colors px-1.5 py-0.5 rounded hover:bg-cyan/10"
                >
                  Mark read
                </button>
              )}
              <button
                onClick={() => removeAlert(alert.id)}
                className="p-0.5 rounded text-text-muted hover:text-text-secondary hover:bg-navy-hover transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────

export function AlertsPanel() {
  const { alerts, isPanelOpen, setPanelOpen, unreadCount, markAllRead, addAlert } =
    useAlertStore();

  // Load existing notifications on mount
  useEffect(() => {
    apiClient
      .get<Alert[]>('/notifications')
      .then((r) => {
        for (const a of r.data) addAlert(a);
      })
      .catch(() => {});
  }, []);

  async function handleMarkAllRead() {
    try { await apiClient.put('/notifications/read-all'); } catch { /* optimistic */ }
    markAllRead();
  }

  const [activeTab, setActiveTab] = React.useState<'all' | 'unread'>('all');
  const displayed = activeTab === 'unread' ? alerts.filter((a) => !a.read) : alerts;

  return (
    <AnimatePresence>
      {isPanelOpen && (
        <motion.aside
          key="alerts-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 35 }}
          className={cn(
            'fixed right-0 top-0 h-screen z-40',
            'w-[360px] flex flex-col',
            'bg-navy-surface border-l border-navy-border shadow-panel'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between h-[60px] px-4 border-b border-navy-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-cyan" />
              <span className="font-display font-semibold text-text-primary">Alerts</span>
              {unreadCount > 0 && (
                <span className="badge bg-status-error/10 text-status-error text-2xs">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="btn-ghost btn-sm"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span className="text-xs">All read</span>
                </button>
              )}
              <button
                onClick={() => setPanelOpen(false)}
                className="btn-icon btn-ghost"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-navy-border flex-shrink-0">
            {(['all', 'unread'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex-1 py-2 text-xs font-medium capitalize transition-colors',
                  activeTab === tab
                    ? 'text-cyan border-b-2 border-cyan'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {tab === 'unread' ? `Unread (${unreadCount})` : `All (${alerts.length})`}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <AnimatePresence mode="popLayout">
              {displayed.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-48 text-text-muted gap-3"
                >
                  <Bell className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No alerts</p>
                </motion.div>
              ) : (
                displayed.map((alert) => (
                  <AlertItem key={alert.id} alert={alert} />
                ))
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-navy-border flex-shrink-0">
            <button
              onClick={() => {
                apiClient.get<Alert[]>('/notifications').then((r) => {
                  for (const a of r.data) addAlert(a);
                });
              }}
              className="btn-ghost btn-sm w-full justify-center"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
