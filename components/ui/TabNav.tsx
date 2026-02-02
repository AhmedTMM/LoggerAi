'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Plane, Users, LayoutDashboard, FolderOpen, LogOut, ChevronDown } from 'lucide-react';

const tabs = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Flights', href: '/flights', icon: Plane },
    { name: 'Pilots', href: '/pilots', icon: Users },
    { name: 'Aircraft', href: '/aircraft', icon: Plane },
    { name: 'Files', href: '/files', icon: FolderOpen },
];

function getInitials(name: string | null | undefined): string {
    if (!name) return '?';
    return name
        .split(' ')
        .map(part => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

export function TabNav() {
    const pathname = usePathname();
    const { data: session, status } = useSession();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
                <div className="ml-auto flex items-center">
                    {status === 'loading' ? (
                        <div className="h-9 w-9 rounded-full bg-zinc-200 animate-pulse" />
                    ) : session?.user ? (
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="flex items-center gap-2 p-1.5 pr-3 rounded-full border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-all"
                            >
                                {session.user.image ? (
                                    <img
                                        src={session.user.image}
                                        alt={session.user.name || 'User'}
                                        className="h-7 w-7 rounded-full ring-2 ring-white"
                                    />
                                ) : (
                                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center ring-2 ring-white">
                                        <span className="text-xs font-semibold text-white">
                                            {getInitials(session.user.name)}
                                        </span>
                                    </div>
                                )}
                                <span className="hidden sm:block text-sm font-medium text-zinc-700 max-w-[120px] truncate">
                                    {session.user.name?.split(' ')[0]}
                                </span>
                                <ChevronDown className={cn(
                                    "h-4 w-4 text-zinc-400 transition-transform",
                                    isDropdownOpen && "rotate-180"
                                )} />
                            </button>

                            {/* Dropdown Menu */}
                            {isDropdownOpen && (
                                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-zinc-200 py-2 z-50">
                                    {/* User Info */}
                                    <div className="px-4 py-3 border-b border-zinc-100">
                                        <div className="flex items-center gap-3">
                                            {session.user.image ? (
                                                <img
                                                    src={session.user.image}
                                                    alt={session.user.name || 'User'}
                                                    className="h-10 w-10 rounded-full"
                                                />
                                            ) : (
                                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                                                    <span className="text-sm font-semibold text-white">
                                                        {getInitials(session.user.name)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-zinc-900 truncate">
                                                    {session.user.name}
                                                </p>
                                                <p className="text-xs text-zinc-500 truncate">
                                                    {session.user.email}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Menu Items */}
                                    <div className="py-1">
                                        <button
                                            onClick={() => {
                                                setIsDropdownOpen(false);
                                                signOut({ callbackUrl: '/login' });
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
                                        >
                                            <LogOut className="h-4 w-4" />
                                            Sign out
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
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
