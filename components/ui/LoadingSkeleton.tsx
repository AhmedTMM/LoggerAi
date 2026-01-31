import { cn } from '@/lib/utils';

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
    return (
        <div className={cn("animate-pulse bg-zinc-200 rounded", className)} />
    );
}

export function LoadingSpinner({ className }: { className?: string }) {
    return (
        <div className={cn("flex items-center justify-center", className)}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
        </div>
    );
}

export function CardSkeleton() {
    return (
        <div className="border border-zinc-200 rounded-xl p-6 bg-white">
            <div className="space-y-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-4 w-full" />
            </div>
        </div>
    );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
    return (
        <div className="space-y-2">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-1/4" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
    return (
        <div className="border border-zinc-200 rounded-lg overflow-hidden">
            <div className="bg-zinc-50 border-b border-zinc-200 p-3">
                <div className="flex gap-4">
                    {Array.from({ length: cols }).map((_, i) => (
                        <Skeleton key={i} className="h-4 flex-1" />
                    ))}
                </div>
            </div>
            <div className="divide-y divide-zinc-100">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="p-3 flex gap-4">
                        {Array.from({ length: cols }).map((_, j) => (
                            <Skeleton key={j} className="h-4 flex-1" />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
