'use client';

/**
 * GridIntel — NotificationBell
 * Bell icon with unread count, opens AlertsPanel on click.
 */

import React from 'react';
import { Bell, Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlertStore } from '@/store/global_stores';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const { unreadCount, isPanelOpen, setPanelOpen, isConnected } = useAlertStore();

  return (
    <div className="flex items-center gap-1">
      {/* WS connection indicator */}
      <div
        title={isConnected ? 'Live — WebSocket connected' : 'Disconnected'}
        className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          isConnected ? 'bg-status-success animate-pulse-cyan' : 'bg-status-error'
        )}
      />

      {/* Bell button */}
      <button
        onClick={() => setPanelOpen(!isPanelOpen)}
        className={cn(
          'relative btn-icon text-text-secondary hover:text-text-primary',
          isPanelOpen && 'text-cyan bg-cyan/10'
        )}
        title="Notifications"
      >
        <Bell className="w-4.5 h-4.5" strokeWidth={2} />

        {/* Unread badge */}
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.div
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className={cn(
                'absolute -top-0.5 -right-0.5',
                'min-w-[16px] h-4 px-1 rounded-full',
                'bg-status-error text-white text-2xs font-bold',
                'flex items-center justify-center leading-none',
                unreadCount > 0 && 'animate-pulse-cyan'
              )}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.div>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
