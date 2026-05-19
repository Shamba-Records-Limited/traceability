import type { Metadata, Viewport } from 'next';

import './globals.css';

import { Toaster } from '../components/ui/toaster';

export const metadata: Metadata = {
  title: {
    default: 'Shamba Traceability',
    template: '%s — Shamba Traceability',
  },
  description:
    'Open-source agricultural traceability platform on Hedera. EUDR-compliant, blockchain-native, multi-commodity.',
  applicationName: 'Shamba Traceability',
  authors: [{ name: 'Shamba Records Limited', url: 'https://shambarecords.com' }],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#3E8530',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-soil-50 text-soil-900 antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
