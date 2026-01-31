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
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-zinc-50 dark:bg-zinc-900 transition-colors font-sans antialiased">
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
