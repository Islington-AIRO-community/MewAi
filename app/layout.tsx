import type { Metadata, Viewport } from 'next';
import { AppShell } from '@/components/layout/app-shell';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://flare-relief.example'),
  title: {
    default: 'FLARE — Post-Disaster Relief Network',
    template: '%s · FLARE Relief Network',
  },
  description:
    'FLARE routes emergency requests to verified response teams, tracks every report in real time, and keeps you informed by text or voice. Built for calm under pressure.',
  applicationName: 'FLARE Relief Network',
  keywords: ['disaster relief', 'emergency', 'SOS', 'relief', 'search and rescue', 'shelter'],
  authors: [{ name: 'FLARE Relief Network' }],
  openGraph: {
    type: 'website',
    title: 'FLARE — Post-Disaster Relief Network',
    description:
      'One tap to reach help. AI triage, real-time tracking, and a voice assistant built for emergencies.',
    siteName: 'FLARE Relief Network',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FLARE — Post-Disaster Relief Network',
    description: 'One tap to reach help. Built for calm under pressure.',
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5, // allow zoom — never disable
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8FAFC' },
    { media: '(prefers-color-scheme: dark)', color: '#0F172A' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="min-h-dvh bg-surface text-ink">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
