import { CheckCircle, AlertTriangle } from 'lucide-react';
import { Badge } from './Badge';
import { getDaysUntil } from '@/lib/utils';

interface MaintenanceItemProps {
    label: string;
    date: Date | string;
}

export function MaintenanceItem({ label, date }: MaintenanceItemProps) {
    const daysLeft = getDaysUntil(date);
    const status = daysLeft < 0 ? 'expired' : daysLeft < 30 ? 'warning' : 'valid';

    return (
        <div className="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-lg">
            <div>
                <div className="flex items-center gap-2">
                    {status === 'valid' ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    <span className="text-sm font-medium text-zinc-900">{label}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 ml-5.5">
                    {new Date(date).toLocaleDateString()}
                </p>
            </div>
            <Badge
                variant={status === 'valid' ? 'secondary' : status === 'warning' ? 'warning' : 'destructive'}
                className="text-[10px]"
            >
                {daysLeft < 0 ? 'Expired' : `${daysLeft}d left`}
            </Badge>
        </div>
    );
}

interface CurrencyItemProps {
    label: string;
    expiration: Date | string;
}

export function CurrencyItem({ label, expiration }: CurrencyItemProps) {
    const daysLeft = getDaysUntil(expiration);
    const status = daysLeft < 0 ? 'expired' : daysLeft < 30 ? 'expiring' : 'valid';

    return (
        <div className="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-lg">
            <div>
                <div className="flex items-center gap-2">
                    {status === 'valid' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                    <span className="text-sm font-medium text-zinc-900">{label}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 ml-6">
                    Expires: {new Date(expiration).toLocaleDateString()}
                </p>
            </div>
            <Badge
                variant={status === 'valid' ? 'success' : status === 'expiring' ? 'warning' : 'destructive'}
            >
                {daysLeft < 0 ? 'Expired' : `${daysLeft}d`}
            </Badge>
        </div>
    );
}
