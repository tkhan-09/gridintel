import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title:       'GridIntel — Power Intelligence Platform',
  description: 'BPDB Power Sector Management System — Generation, MOD, Energy Accounting, Billing & Analytics',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-navy-bg text-text-primary antialiased">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1A2B45',
              color:      '#F4F6F9',
              border:     '1px solid #1E3A5F',
              borderRadius: '6px',
              fontSize:   '13px',
              fontFamily: "'DM Sans', sans-serif",
            },
            success: {
              iconTheme: { primary: '#10B981', secondary: '#1A2B45' },
              duration: 3000,
            },
            error: {
              iconTheme: { primary: '#EF4444', secondary: '#1A2B45' },
              duration: 5000,
            },
          }}
        />
      </body>
    </html>
  );
}
