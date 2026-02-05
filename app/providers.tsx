'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState } from 'react';
import { AnonymousProvider } from '@/lib/anonymous-context';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            retry: 1,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <AnonymousProvider>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </AnonymousProvider>
    </SessionProvider>
  );
}
