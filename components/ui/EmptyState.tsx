import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
    className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div className={cn("flex flex-col items-center justify-center text-center p-8", className)}>
            <div className="w-16 h-16 bg-white border border-zinc-200 rounded-full flex items-center justify-center shadow-sm mb-4">
                <Icon className="w-8 h-8 text-zinc-300" />
            </div>
            <h3 className="text-lg font-medium text-zinc-900">{title}</h3>
            {description && (
                <p className="text-zinc-500 max-w-xs mx-auto mt-2">{description}</p>
            )}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}
