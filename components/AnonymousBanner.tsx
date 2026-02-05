'use client';

import { useAnonymous } from '@/lib/anonymous-context';
import { AlertTriangle, LogIn, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';

const ANONYMOUS_COOKIE = 'loggerai-anonymous-session';

export function AnonymousBanner() {
  const { isAnonymous, setAnonymous, clearAllData } = useAnonymous();
  const router = useRouter();

  if (!isAnonymous) {
    return null;
  }

  const handleSignIn = () => {
    // Clear anonymous mode and redirect to login
    Cookies.remove(ANONYMOUS_COOKIE);
    sessionStorage.removeItem('loggerai-anonymous-mode');
    setAnonymous(false);
    clearAllData();
    router.push('/login');
  };

  const handleDismiss = () => {
    // Just hide the banner for this session, don't exit anonymous mode
    const banner = document.getElementById('anonymous-banner');
    if (banner) {
      banner.style.display = 'none';
    }
  };

  return (
    <div
      id="anonymous-banner"
      className="bg-amber-50 border-b border-amber-200 px-4 py-2"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <p className="text-sm">
            <strong>Guest Mode:</strong> Your data is stored locally and will be lost when you close the browser.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSignIn}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium text-amber-800 hover:text-amber-900 hover:bg-amber-100 rounded-md transition-colors"
          >
            <LogIn className="h-4 w-4" />
            Sign in to save
          </button>
          <button
            onClick={handleDismiss}
            className="p-1 text-amber-600 hover:text-amber-800 hover:bg-amber-100 rounded transition-colors"
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
