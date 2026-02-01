import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { TabNav } from '@/components/ui/TabNav';

export const metadata: Metadata = {
  title: 'LogHacker - Aviation Intelligence',
  description: 'Flight legality audits and risk management.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            document.documentElement.classList.remove('dark');
            localStorage.removeItem('theme');
          `
        }} />
      </head>
      <body className="min-h-screen bg-zinc-50 font-sans antialiased">
        <Providers>
          <div className="min-h-screen flex flex-col">
            <TabNav />
            <main className="flex-1 p-4 md:p-6">
              <div className="max-w-7xl mx-auto">
                {children}
              </div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
