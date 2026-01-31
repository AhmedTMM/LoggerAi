'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTheme } from '@/app/providers';
import { Plane, Users, LayoutDashboard, FolderOpen, Sun, Moon } from 'lucide-react';

const tabs = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Flights', href: '/flights', icon: Plane },
    { name: 'Pilots', href: '/pilots', icon: Users },
    { name: 'Aircraft', href: '/aircraft', icon: Plane },
    { name: 'Files', href: '/files', icon: FolderOpen },
];

export function TabNav() {
    const pathname = usePathname();
    const { theme, toggleTheme } = useTheme();

    return (
        <header className="sticky top-0 z-40 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md">
            <div className="flex h-14 items-center px-4 md:px-6">
                {/* Brand */}
                <Link href="/" className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-100 mr-6">
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
                                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                                        : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800"
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                <span className="hidden md:inline">{tab.name}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-2 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    aria-label="Toggle theme"
                >
                    {theme === 'dark' ? (
                        <Sun className="h-5 w-5" />
                    ) : (
                        <Moon className="h-5 w-5" />
                    )}
                </button>
            </div>
        </header>
    );
}
