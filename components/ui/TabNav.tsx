'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { Plane, Users, LayoutDashboard, FolderOpen, LogOut } from 'lucide-react';

const tabs = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Flights', href: '/flights', icon: Plane },
    { name: 'Pilots', href: '/pilots', icon: Users },
    { name: 'Aircraft', href: '/aircraft', icon: Plane },
    { name: 'Files', href: '/files', icon: FolderOpen },
];

export function TabNav() {
    const pathname = usePathname();
    const { data: session, status } = useSession();

    // Don't show nav on login page
    if (pathname === '/login') {
        return null;
    }

    return (
        <header className="sticky top-0 z-40 w-full border-b border-zinc-200 bg-white/90 backdrop-blur-md">
            <div className="flex h-14 items-center px-4 md:px-6">
                {/* Brand */}
                <Link href="/" className="flex items-center gap-2 font-bold text-zinc-900 mr-6">
                    <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                        <Plane className="h-5 w-5" />
                    </div>
                    <span className="hidden sm:inline-block text-lg">LogHacker</span>
                </Link>

                {/* Navigation */}
                <nav className="flex items-center gap-1">
                    {tabs.map((tab) => {
                        const isActive = pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href));
                        const Icon = tab.icon;

                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                                    isActive
                                        ? "bg-blue-100 text-blue-700"
                                        : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100"
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                <span className="hidden md:inline">{tab.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* User Section */}
                <div className="ml-auto flex items-center gap-3">
                    {status === 'loading' ? (
                        <div className="h-8 w-8 rounded-full bg-zinc-200 animate-pulse" />
                    ) : session?.user ? (
                        <>
                            <div className="hidden sm:flex items-center gap-2">
                                {session.user.image && (
                                    <img
                                        src={session.user.image}
                                        alt={session.user.name || 'User'}
                                        className="h-8 w-8 rounded-full"
                                    />
                                )}
                                <span className="text-sm font-medium text-zinc-700">
                                    {session.user.name}
                                </span>
                            </div>
                            <button
                                onClick={() => signOut({ callbackUrl: '/login' })}
                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                            >
                                <LogOut className="h-4 w-4" />
                                <span className="hidden md:inline">Sign Out</span>
                            </button>
                        </>
                    ) : (
                        <Link
                            href="/login"
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Sign In
                        </Link>
                    )}
                </div>
            </div>
        </header>
    );
}
