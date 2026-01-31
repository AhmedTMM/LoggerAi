import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Date utilities
export function getDaysUntil(date: Date | string): number {
    return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    });
}

export function formatTime(date: Date | string): string {
    return new Date(date).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function formatDateTime(date: Date | string, time?: string): string {
    const d = new Date(date);
    if (time) {
        return `${formatDate(d)} ${time}`;
    }
    return `${formatDate(d)} ${formatTime(d)}`;
}

export function formatShortDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Status utilities
export type FlightStatusType = 'go' | 'caution' | 'no-go' | 'pending';

export function getStatusBadgeVariant(status: string): 'success' | 'warning' | 'destructive' | 'secondary' {
    switch (status) {
        case 'go': return 'success';
        case 'caution': return 'warning';
        case 'no-go': return 'destructive';
        default: return 'secondary';
    }
}

export function getStatusLabel(status: string): string {
    switch (status) {
        case 'go': return 'GO';
        case 'caution': return 'CAUTION';
        case 'no-go': return 'NO-GO';
        default: return 'PENDING';
    }
}

export function getFlightCategoryColor(category: string): string {
    switch (category) {
        case 'VFR': return 'text-green-600 bg-green-50 border-green-200';
        case 'MVFR': return 'text-blue-600 bg-blue-50 border-blue-200';
        case 'IFR': return 'text-red-600 bg-red-50 border-red-200';
        case 'LIFR': return 'text-purple-600 bg-purple-50 border-purple-200';
        default: return 'text-zinc-600 bg-zinc-50 border-zinc-200';
    }
}

// Certificate label mapping
export function getCertificateLabel(type: string): string {
    const labels: Record<string, string> = {
        Student: 'Student Pilot',
        PPL: 'Private Pilot',
        CPL: 'Commercial Pilot',
        ATP: 'Airline Transport Pilot',
        Sport: 'Sport Pilot'
    };
    return labels[type] || type;
}
