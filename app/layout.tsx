import type { Metadata, Viewport } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { RegisterSW } from '@/components/shell/RegisterSW';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'LifeOS',
  description: 'Goals, projects, tasks, habits and money in one place.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'LifeOS',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // one colour; the script below and the theme toggle keep it in step with the theme actually showing
  themeColor: '#0f1011',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${geistMono.variable}`}>
      <head>
        {/* Applies the persisted theme before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('lifeos:theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}var f=function(){var d=document.documentElement.classList.contains('dark');var m=document.querySelector('meta[name=theme-color]');if(m){m.setAttribute('content',d?'#0f1011':'#e9ecf2');}};f();document.addEventListener('DOMContentLoaded',f);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        {children}
        <Toaster />
        <RegisterSW />
      </body>
    </html>
  );
}
