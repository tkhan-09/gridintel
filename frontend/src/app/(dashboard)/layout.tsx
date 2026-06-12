'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/layout/Shell';
import { useAuthStore } from '@/store/global_stores';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setChecked(true);
  }, []);

  useEffect(() => {
    if (checked && !isAuthenticated) {
      router.replace('/login');
    }
  }, [checked, isAuthenticated, router]);

  if (!checked) return null;
  if (!isAuthenticated) return null;
  return <Shell>{children}</Shell>;
}
