import { Badge } from './Badge';
import { getStatusBadgeVariant, getStatusLabel } from '@/lib/utils';

interface StatusBadgeProps {
    status: string;
    size?: 'sm' | 'default';
    className?: string;
}

export function StatusBadge({ status, size = 'default', className }: StatusBadgeProps) {
    return (
        <Badge
            variant={getStatusBadgeVariant(status)}
            className={`${size === 'sm' ? 'text-[10px] h-5 px-1.5' : 'text-sm px-2.5 py-0.5'} ${className || ''}`}
        >
            {getStatusLabel(status)}
        </Badge>
    );
}
