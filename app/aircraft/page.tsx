'use client';

import React, { useState, useEffect } from 'react';
import { Plane, Plus, AlertTriangle, CheckCircle, Wrench, Trash2, RefreshCw, Clock, Shield, History, FileText, ChevronDown, ChevronUp, Pencil, Check, X, Info } from 'lucide-react';
import { useAircraft, useCreateAircraft, useDeleteAircraft, useUpdateAircraft, useParsedDocuments, useGenerateSafetyAnalysis } from '@/lib/hooks';
import type { Aircraft } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSkeleton';
import { cn, getDaysUntil } from '@/lib/utils';

type TabType = 'overview' | 'maintenance' | 'safety' | 'documents';

// Estimate Hobbs from Tach if not available
// Typical Hobbs runs ~10-15% higher than Tach (cruise vs continuous)
const getDisplayHobbs = (hobbs: number | undefined, tach: number | undefined): { value: number; isEstimated: boolean } => {
    if (hobbs && hobbs > 0) {
        return { value: hobbs, isEstimated: false };
    }
    if (tach && tach > 0) {
        // Estimate Hobbs as Tach * 1.1 (typical ratio)
        return { value: tach * 1.1, isEstimated: true };
    }
    return { value: 0, isEstimated: false };
};

export default function AircraftPage() {
    const { data: fleet, isLoading, error, refetch } = useAircraft();
    const createAircraft = useCreateAircraft();
    const deleteAircraft = useDeleteAircraft();
    const updateAircraft = useUpdateAircraft();
    const generateSafetyAnalysis = useGenerateSafetyAnalysis();

    const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
    const [editingDate, setEditingDate] = useState<string | null>(null);
    const [editDateValue, setEditDateValue] = useState('');
    const [activeTab, setActiveTab] = useState<TabType>('overview');

    // Auto-generate safety analysis when aircraft is selected without one
    useEffect(() => {
        if (selectedAircraft && !selectedAircraft.safetyAnalysis && !isGeneratingAnalysis) {
            // Only generate if the aircraft has logs to analyze
            const hasLogs = (selectedAircraft.logs && selectedAircraft.logs.length > 0) ||
                           (selectedAircraft.logbooks && Object.values(selectedAircraft.logbooks).some(arr => arr && arr.length > 0));

            if (hasLogs) {
                setIsGeneratingAnalysis(true);
                generateSafetyAnalysis.mutate(selectedAircraft._id, {
                    onSuccess: () => {
                        refetch();
                        setIsGeneratingAnalysis(false);
                    },
                    onError: () => {
                        setIsGeneratingAnalysis(false);
                    },
                });
            }
        }
    }, [selectedAircraft?._id, selectedAircraft?.safetyAnalysis]);

    const getMaintenanceStatus = (date: Date | string) => {
        const days = getDaysUntil(date);
        if (days < 0) return { color: 'text-red-500', badge: 'destructive', text: 'Overdue' };
        if (days < 30) return { color: 'text-amber-500', badge: 'warning', text: `${days}d left` };
        return { color: 'text-emerald-500', badge: 'success', text: 'Current' };
    };

    if (isLoading) return <LoadingSpinner className="h-96" />;
    if (error) return (
        <div className="text-center py-12">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-zinc-600">Failed to load aircraft</p>
        </div>
    );

    const maintenanceDue = fleet?.filter(ac => getDaysUntil(ac.maintenanceDates?.annual) < 30).length || 0;

    const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
        { id: 'overview', label: 'Overview', icon: <Info className="w-4 h-4" /> },
        { id: 'maintenance', label: 'Maintenance', icon: <Wrench className="w-4 h-4" /> },
        { id: 'safety', label: 'Safety', icon: <Shield className="w-4 h-4" /> },
        { id: 'documents', label: 'Documents', icon: <FileText className="w-4 h-4" /> },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900">Aircraft</h1>
                    <p className="text-zinc-500">Manage your fleet</p>
                </div>
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Aircraft
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-zinc-200 p-4">
                    <p className="text-sm text-zinc-500">Total Aircraft</p>
                    <p className="text-2xl font-bold text-zinc-900">{fleet?.length || 0}</p>
                </div>
                <div className="bg-white rounded-xl border border-zinc-200 p-4">
                    <p className="text-sm text-zinc-500">Maintenance Due</p>
                    <p className={cn("text-2xl font-bold", maintenanceDue > 0 ? "text-amber-500" : "text-zinc-900")}>
                        {maintenanceDue}
                    </p>
                </div>
                <div className="bg-white rounded-xl border border-zinc-200 p-4">
                    <p className="text-sm text-zinc-500">Total Hours</p>
                    <p className="text-2xl font-bold text-zinc-900">
                        {fleet?.reduce((acc, curr) => {
                            const hobbsInfo = getDisplayHobbs(curr.currentHours?.hobbs, curr.currentHours?.tach);
                            return acc + hobbsInfo.value;
                        }, 0).toFixed(0) || '0'}
                    </p>
                </div>
                <div className="bg-white rounded-xl border border-zinc-200 p-4">
                    <p className="text-sm text-zinc-500">All Current</p>
                    <p className="text-2xl font-bold text-emerald-500">
                        {(fleet?.length || 0) - maintenanceDue}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
                {/* Aircraft List */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                        <div className="p-3 border-b border-zinc-200 bg-zinc-50">
                            <h3 className="font-semibold text-zinc-900">Fleet</h3>
                        </div>
                        <div className="max-h-[250px] sm:max-h-[350px] lg:max-h-[500px] overflow-y-auto">
                            {fleet?.map((ac) => {
                                const isSelected = selectedAircraft?._id === ac._id;
                                const annualStatus = getMaintenanceStatus(ac.maintenanceDates?.annual);

                                return (
                                    <div
                                        key={ac._id}
                                        onClick={() => {
                                            setSelectedAircraft(ac);
                                            setActiveTab('overview');
                                        }}
                                        className={cn(
                                            "p-4 border-b border-zinc-100 cursor-pointer transition-colors",
                                            isSelected
                                                ? "bg-blue-50 border-l-4 border-l-blue-500"
                                                : "hover:bg-zinc-50"
                                        )}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-zinc-900">{ac.tailNumber}</span>
                                            {getDaysUntil(ac.maintenanceDates?.annual) < 30 && (
                                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                            )}
                                        </div>
                                        <p className="text-sm text-zinc-500">{ac.model}</p>
                                        <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                                            {(() => {
                                                const hobbsInfo = getDisplayHobbs(ac.currentHours?.hobbs, ac.currentHours?.tach);
                                                return (
                                                    <span className={hobbsInfo.isEstimated ? 'text-amber-500' : ''}>
                                                        {hobbsInfo.value.toFixed(0)} hrs{hobbsInfo.isEstimated ? '*' : ''}
                                                    </span>
                                                );
                                            })()}
                                            <span className={annualStatus.color}>Annual: {annualStatus.text}</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {(!fleet || fleet.length === 0) && (
                                <div className="p-8 text-center">
                                    <Plane className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                                    <p className="text-zinc-500">No aircraft added yet</p>
                                    <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowAddModal(true)}>
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add Aircraft
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Aircraft Details */}
                <div className="lg:col-span-3">
                    <div className="bg-white rounded-xl border border-zinc-200 min-h-[350px] lg:min-h-[600px]">
                        {selectedAircraft ? (
                            <div className="h-full flex flex-col">
                                {/* Header */}
                                <div className="p-4 sm:p-6 border-b border-zinc-200">
                                    <div className="flex items-start sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3 sm:gap-4">
                                            <div className="w-14 h-14 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl sm:rounded-2xl flex items-center justify-center overflow-hidden border-2 border-blue-200 shadow-sm flex-shrink-0">
                                                {selectedAircraft.imageUrl ? (
                                                    <img
                                                        src={selectedAircraft.imageUrl}
                                                        alt={selectedAircraft.tailNumber}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <Plane className="w-6 h-6 sm:w-10 sm:h-10 text-blue-600" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <h2 className="text-lg sm:text-xl font-bold text-zinc-900 truncate">{selectedAircraft.tailNumber}</h2>
                                                <p className="text-sm sm:text-base text-zinc-500 truncate">{selectedAircraft.year !== new Date().getFullYear() ? selectedAircraft.year : ''} {selectedAircraft.manufacturer !== 'Unknown' ? selectedAircraft.manufacturer : ''} {selectedAircraft.model !== 'Unknown' ? selectedAircraft.model : 'Aircraft'}</p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowDeleteModal(true)}
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Tabs */}
                                <div className="border-b border-zinc-200 px-4 sm:px-6">
                                    <nav className="flex gap-1 -mb-px overflow-x-auto">
                                        {tabs.map((tab) => (
                                            <button
                                                key={tab.id}
                                                onClick={() => setActiveTab(tab.id)}
                                                className={cn(
                                                    "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                                                    activeTab === tab.id
                                                        ? "border-blue-500 text-blue-600"
                                                        : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
                                                )}
                                            >
                                                {tab.icon}
                                                {tab.label}
                                            </button>
                                        ))}
                                    </nav>
                                </div>

                                {/* Tab Content */}
                                <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
                                    {activeTab === 'overview' && (
                                        <OverviewTab
                                            aircraft={selectedAircraft}
                                            getMaintenanceStatus={getMaintenanceStatus}
                                            getDisplayHobbs={getDisplayHobbs}
                                        />
                                    )}
                                    {activeTab === 'maintenance' && (
                                        <MaintenanceTab
                                            aircraft={selectedAircraft}
                                            getMaintenanceStatus={getMaintenanceStatus}
                                            editingDate={editingDate}
                                            setEditingDate={setEditingDate}
                                            editDateValue={editDateValue}
                                            setEditDateValue={setEditDateValue}
                                            updateAircraft={updateAircraft}
                                            refetch={refetch}
                                        />
                                    )}
                                    {activeTab === 'safety' && (
                                        <SafetyTab
                                            aircraft={selectedAircraft}
                                            isGeneratingAnalysis={isGeneratingAnalysis}
                                            setIsGeneratingAnalysis={setIsGeneratingAnalysis}
                                            generateSafetyAnalysis={generateSafetyAnalysis}
                                            refetch={refetch}
                                        />
                                    )}
                                    {activeTab === 'documents' && (
                                        <DocumentsTab aircraftId={selectedAircraft._id} />
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8">
                                <Plane className="w-12 h-12 text-zinc-300 mb-4" />
                                <h3 className="text-lg font-medium text-zinc-900">No Aircraft Selected</h3>
                                <p className="text-zinc-500 mt-2">Select an aircraft to view details</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <AddAircraftModal
                    onClose={() => setShowAddModal(false)}
                    onCreated={() => {
                        setShowAddModal(false);
                        refetch();
                    }}
                    createAircraft={createAircraft}
                />
            )}

            {/* Delete Modal */}
            {showDeleteModal && selectedAircraft && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
                        <h3 className="text-lg font-bold text-zinc-900 mb-2">Delete Aircraft?</h3>
                        <p className="text-zinc-600 mb-6">
                            Are you sure you want to delete {selectedAircraft.tailNumber}?
                        </p>
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={() => setShowDeleteModal(false)} className="flex-1">
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => {
                                    deleteAircraft.mutate(selectedAircraft._id as string, {
                                        onSuccess: () => {
                                            setShowDeleteModal(false);
                                            setSelectedAircraft(null);
                                            refetch();
                                        }
                                    });
                                }}
                                disabled={deleteAircraft.isPending}
                                className="flex-1"
                            >
                                {deleteAircraft.isPending ? 'Deleting...' : 'Delete'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SafetyStatusCard({
    aircraft,
    getMaintenanceStatus
}: {
    aircraft: Aircraft;
    getMaintenanceStatus: (date: Date | string) => { color: string; badge: string; text: string };
}) {
    // Calculate maintenance status
    const maintenanceItems = [
        { key: 'annual', label: 'Annual', date: aircraft.maintenanceDates?.annual },
        { key: 'transponder', label: 'Transponder', date: aircraft.maintenanceDates?.transponder },
        { key: 'staticSystem', label: 'Pitot-Static', date: aircraft.maintenanceDates?.staticSystem },
        { key: 'hundredHour', label: '100-Hour', date: aircraft.maintenanceDates?.hundredHour },
    ];

    const overdueItems = maintenanceItems.filter(item =>
        item.date && getDaysUntil(item.date) < 0
    );

    const dueItems = maintenanceItems.filter(item =>
        item.date && getDaysUntil(item.date) >= 0 && getDaysUntil(item.date) < 30
    );

    // Calculate overall airworthiness
    const hasOverdue = overdueItems.length > 0;
    const hasDueSoon = dueItems.length > 0;
    const safetyScore = aircraft.safetyAnalysis?.score || null;

    let overallStatus: 'NO-GO' | 'CAUTION' | 'GO';
    let statusColor: string;
    let statusBg: string;
    let statusIcon: typeof AlertTriangle;

    if (hasOverdue || (safetyScore !== null && safetyScore < 60)) {
        overallStatus = 'NO-GO';
        statusColor = 'text-red-600';
        statusBg = 'bg-red-50 border-red-200';
        statusIcon = AlertTriangle;
    } else if (hasDueSoon || (safetyScore !== null && safetyScore < 80)) {
        overallStatus = 'CAUTION';
        statusColor = 'text-amber-600';
        statusBg = 'bg-amber-50 border-amber-200';
        statusIcon = AlertTriangle;
    } else {
        overallStatus = 'GO';
        statusColor = 'text-emerald-600';
        statusBg = 'bg-emerald-50 border-emerald-200';
        statusIcon = CheckCircle;
    }

    const StatusIcon = statusIcon;

    return (
        <div className={cn("rounded-lg border-2 p-5", statusBg)}>
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h4 className="font-semibold text-zinc-900 mb-1 flex items-center gap-2">
                        <Shield className="w-5 h-5" /> Airworthiness Status
                    </h4>
                    <p className="text-xs text-zinc-500">Overall safety assessment</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <div className={cn("flex items-center gap-2 px-3 py-1 rounded-lg font-bold text-lg",
                        overallStatus === 'NO-GO' ? 'bg-red-100' :
                        overallStatus === 'CAUTION' ? 'bg-amber-100' : 'bg-emerald-100'
                    )}>
                        <StatusIcon className={cn("w-5 h-5", statusColor)} />
                        <span className={statusColor}>{overallStatus}</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
                {/* Overdue Items */}
                <div className="bg-white/60 rounded-lg p-3 border border-white/50">
                    <p className="text-xs text-zinc-500 uppercase mb-1">Overdue</p>
                    <p className={cn(
                        "text-2xl font-bold",
                        overdueItems.length > 0 ? "text-red-600" : "text-zinc-400"
                    )}>
                        {overdueItems.length}
                    </p>
                    {overdueItems.length > 0 && (
                        <div className="mt-2 space-y-1">
                            {overdueItems.map(item => (
                                <p key={item.key} className="text-xs text-red-600">
                                    • {item.label}
                                </p>
                            ))}
                        </div>
                    )}
                </div>

                {/* Due Soon */}
                <div className="bg-white/60 rounded-lg p-3 border border-white/50">
                    <p className="text-xs text-zinc-500 uppercase mb-1">Due Soon</p>
                    <p className={cn(
                        "text-2xl font-bold",
                        dueItems.length > 0 ? "text-amber-600" : "text-zinc-400"
                    )}>
                        {dueItems.length}
                    </p>
                    {dueItems.length > 0 && (
                        <div className="mt-2 space-y-1">
                            {dueItems.map(item => (
                                <p key={item.key} className="text-xs text-amber-600">
                                    • {item.label} ({item.date ? getDaysUntil(item.date) : 0}d)
                                </p>
                            ))}
                        </div>
                    )}
                </div>

                {/* Safety Score */}
                <div className="bg-white/60 rounded-lg p-3 border border-white/50">
                    <p className="text-xs text-zinc-500 uppercase mb-1">Safety Score</p>
                    {safetyScore !== null ? (
                        <>
                            <p className={cn(
                                "text-2xl font-bold",
                                safetyScore >= 80 ? "text-emerald-600" :
                                safetyScore >= 60 ? "text-amber-600" : "text-red-600"
                            )}>
                                {safetyScore}
                            </p>
                            <p className="text-xs text-zinc-500 mt-1">
                                {safetyScore >= 80 ? 'Excellent' :
                                 safetyScore >= 60 ? 'Fair' : 'Poor'}
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-2xl font-bold text-zinc-400">—</p>
                            <p className="text-xs text-zinc-400 mt-1">Not analyzed</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// Overview Tab Component
function OverviewTab({
    aircraft,
    getMaintenanceStatus,
    getDisplayHobbs,
}: {
    aircraft: Aircraft;
    getMaintenanceStatus: (date: Date | string) => { color: string; badge: string; text: string };
    getDisplayHobbs: (hobbs: number | undefined, tach: number | undefined) => { value: number; isEstimated: boolean };
}) {
    return (
        <div className="space-y-6">
            {/* Safety Status At A Glance */}
            <SafetyStatusCard
                aircraft={aircraft}
                getMaintenanceStatus={getMaintenanceStatus}
            />

            {/* Aircraft Times */}
            <div>
                <h4 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Aircraft Times
                </h4>
                <div className="grid grid-cols-2 gap-4">
                    {(() => {
                        const hobbsInfo = getDisplayHobbs(
                            aircraft.currentHours?.hobbs,
                            aircraft.currentHours?.tach
                        );
                        return (
                            <div className="bg-zinc-50 rounded-lg p-4">
                                <p className="text-xs text-zinc-500 uppercase flex items-center gap-1">
                                    Hobbs
                                    {hobbsInfo.isEstimated && (
                                        <span className="text-amber-500">(est.)</span>
                                    )}
                                </p>
                                <p className={cn(
                                    "text-2xl font-bold",
                                    hobbsInfo.isEstimated
                                        ? "text-amber-600"
                                        : "text-zinc-900"
                                )}>
                                    {hobbsInfo.value.toFixed(1)}
                                </p>
                                {hobbsInfo.isEstimated && (
                                    <p className="text-xs text-amber-600 mt-1">
                                        Based on Tach × 1.1
                                    </p>
                                )}
                            </div>
                        );
                    })()}
                    <div className="bg-zinc-50 rounded-lg p-4">
                        <p className="text-xs text-zinc-500 uppercase">Tach</p>
                        <p className="text-2xl font-bold text-zinc-900">{aircraft.currentHours?.tach?.toFixed(1) || 0}</p>
                    </div>
                </div>
            </div>

            {/* Details */}
            <div>
                <h4 className="font-semibold text-zinc-900 mb-3">Details</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div className="p-3 bg-zinc-50 rounded-lg">
                        <p className="text-zinc-500">Manufacturer</p>
                        <p className="font-medium text-zinc-900">{aircraft.manufacturer || 'N/A'}</p>
                    </div>
                    <div className="p-3 bg-zinc-50 rounded-lg">
                        <p className="text-zinc-500">Model</p>
                        <p className="font-medium text-zinc-900">{aircraft.model || 'N/A'}</p>
                    </div>
                    <div className="p-3 bg-zinc-50 rounded-lg">
                        <p className="text-zinc-500">Serial</p>
                        <p className="font-medium text-zinc-900">{aircraft.serial || 'N/A'}</p>
                    </div>
                    <div className="p-3 bg-zinc-50 rounded-lg">
                        <p className="text-zinc-500">Year</p>
                        <p className="font-medium text-zinc-900">{aircraft.year || 'N/A'}</p>
                    </div>
                </div>
            </div>

            {/* Quick Maintenance Status */}
            <div>
                <h4 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                    <Wrench className="w-4 h-4" /> Maintenance Quick View
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { key: 'annual', label: 'Annual', date: aircraft.maintenanceDates?.annual },
                        { key: 'transponder', label: 'Transponder', date: aircraft.maintenanceDates?.transponder },
                        { key: 'staticSystem', label: 'Pitot-Static', date: aircraft.maintenanceDates?.staticSystem },
                        { key: 'hundredHour', label: '100-Hour', date: aircraft.maintenanceDates?.hundredHour },
                    ].map((item) => {
                        const status = item.date ? getMaintenanceStatus(item.date) : null;
                        return (
                            <div key={item.key} className="p-3 bg-zinc-50 rounded-lg">
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs text-zinc-500">{item.label}</p>
                                    {status && (
                                        <Badge variant={status.badge as any} className="text-xs">
                                            {status.text}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-sm font-medium text-zinc-900">
                                    {item.date ? new Date(item.date).toLocaleDateString() : 'Not set'}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// Maintenance Tab Component
function MaintenanceTab({
    aircraft,
    getMaintenanceStatus,
    editingDate,
    setEditingDate,
    editDateValue,
    setEditDateValue,
    updateAircraft,
    refetch,
}: {
    aircraft: Aircraft;
    getMaintenanceStatus: (date: Date | string) => { color: string; badge: string; text: string };
    editingDate: string | null;
    setEditingDate: (date: string | null) => void;
    editDateValue: string;
    setEditDateValue: (value: string) => void;
    updateAircraft: any;
    refetch: () => void;
}) {
    return (
        <div className="space-y-6">
            {/* Maintenance Status */}
            <div>
                <h4 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                    <Wrench className="w-4 h-4" /> Maintenance Status
                </h4>
                <div className="space-y-3">
                    {[
                        { key: 'annual', label: 'Annual Inspection', date: aircraft.maintenanceDates?.annual },
                        { key: 'transponder', label: 'Transponder Check', date: aircraft.maintenanceDates?.transponder },
                        { key: 'staticSystem', label: 'Pitot-Static', date: aircraft.maintenanceDates?.staticSystem },
                        { key: 'hundredHour', label: '100-Hour Inspection', date: aircraft.maintenanceDates?.hundredHour },
                    ].map((item) => {
                        const status = item.date ? getMaintenanceStatus(item.date) : null;
                        const isEditing = editingDate === item.key;

                        const handleSave = () => {
                            if (!editDateValue) return;
                            updateAircraft.mutate({
                                id: aircraft._id as string,
                                aircraft: {
                                    maintenanceDates: {
                                        ...aircraft.maintenanceDates,
                                        [item.key]: new Date(editDateValue),
                                    },
                                },
                            }, {
                                onSuccess: () => {
                                    setEditingDate(null);
                                    refetch();
                                },
                            });
                        };

                        const handleStartEdit = () => {
                            setEditingDate(item.key);
                            setEditDateValue(
                                item.date
                                    ? new Date(item.date).toISOString().split('T')[0]
                                    : new Date().toISOString().split('T')[0]
                            );
                        };

                        return (
                            <div key={item.key} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-zinc-50 rounded-lg gap-2">
                                <span className="text-zinc-700 font-medium">{item.label}</span>
                                <div className="flex items-center gap-2">
                                    {isEditing ? (
                                        <>
                                            <input
                                                type="date"
                                                value={editDateValue}
                                                onChange={(e) => setEditDateValue(e.target.value)}
                                                className="px-2 py-1 text-sm border border-zinc-300 rounded bg-white text-zinc-900"
                                            />
                                            <button
                                                onClick={handleSave}
                                                disabled={updateAircraft.isPending}
                                                className="p-1 text-emerald-600 hover:bg-emerald-100 rounded"
                                            >
                                                {updateAircraft.isPending ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Check className="w-4 h-4" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => setEditingDate(null)}
                                                className="p-1 text-zinc-500 hover:bg-zinc-200 rounded"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-sm text-zinc-500">
                                                {item.date ? new Date(item.date).toLocaleDateString() : 'Not set'}
                                            </span>
                                            {status && <Badge variant={status.badge as any}>{status.text}</Badge>}
                                            <button
                                                onClick={handleStartEdit}
                                                className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 rounded"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Maintenance History */}
            <MaintenanceHistorySection
                aircraftId={aircraft._id}
                aircraftLogs={aircraft.logs}
            />
        </div>
    );
}

// Safety Tab Component
function SafetyTab({
    aircraft,
    isGeneratingAnalysis,
    setIsGeneratingAnalysis,
    generateSafetyAnalysis,
    refetch,
}: {
    aircraft: Aircraft;
    isGeneratingAnalysis: boolean;
    setIsGeneratingAnalysis: (value: boolean) => void;
    generateSafetyAnalysis: any;
    refetch: () => void;
}) {
    const handleRegenerate = () => {
        setIsGeneratingAnalysis(true);
        generateSafetyAnalysis.mutate(aircraft._id, {
            onSuccess: () => {
                refetch();
                setIsGeneratingAnalysis(false);
            },
            onError: () => setIsGeneratingAnalysis(false),
        });
    };

    if (isGeneratingAnalysis) {
        return (
            <div className="p-8 text-center">
                <RefreshCw className="w-10 h-10 text-blue-500 mx-auto mb-3 animate-spin" />
                <p className="text-zinc-600 font-medium">Generating Safety Analysis...</p>
                <p className="text-sm text-zinc-500 mt-1">Analyzing maintenance records and aircraft data</p>
            </div>
        );
    }

    if (!aircraft.safetyAnalysis?.findings || aircraft.safetyAnalysis.findings.length === 0) {
        const hasLogs = (aircraft.logs && aircraft.logs.length > 0) ||
            (aircraft.logbooks && Object.values(aircraft.logbooks).some(arr => arr && arr.length > 0));

        return (
            <div className="p-8 text-center">
                <Shield className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                <p className="text-zinc-600 font-medium">No Safety Analysis Available</p>
                <p className="text-sm text-zinc-500 mt-1">
                    {hasLogs
                        ? 'Generate an analysis to assess aircraft safety'
                        : 'Upload maintenance logs to generate analysis'}
                </p>
                {hasLogs && (
                    <Button onClick={handleRegenerate} className="mt-4">
                        <Shield className="w-4 h-4 mr-2" />
                        Generate Analysis
                    </Button>
                )}
            </div>
        );
    }

    const { score, findings } = aircraft.safetyAnalysis;
    const scoreColor = score >= 80 ? 'emerald' : score >= 60 ? 'amber' : 'red';

    return (
        <div className="space-y-6">
            {/* Score Card */}
            <div className={cn(
                "rounded-lg p-6 border",
                scoreColor === 'emerald' ? "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200" :
                scoreColor === 'amber' ? "bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200" :
                "bg-gradient-to-br from-red-50 to-red-100 border-red-200"
            )}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Shield className={cn(
                            "w-8 h-8",
                            scoreColor === 'emerald' ? "text-emerald-600" :
                            scoreColor === 'amber' ? "text-amber-600" : "text-red-600"
                        )} />
                        <div>
                            <h3 className="font-semibold text-zinc-900">Safety Score</h3>
                            <p className="text-sm text-zinc-600">
                                Based on maintenance history and inspection status
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className={cn(
                            "text-4xl font-bold",
                            scoreColor === 'emerald' ? "text-emerald-700" :
                            scoreColor === 'amber' ? "text-amber-700" : "text-red-700"
                        )}>
                            {score}
                        </p>
                        <p className="text-sm text-zinc-500">
                            {score >= 80 ? 'Excellent' : score >= 60 ? 'Fair' : 'Needs Attention'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">
                        Last analyzed: {new Date(aircraft.safetyAnalysis.lastAnalyzed).toLocaleDateString()}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRegenerate}
                        disabled={isGeneratingAnalysis}
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Regenerate
                    </Button>
                </div>
            </div>

            {/* Findings */}
            <div>
                <h4 className="font-semibold text-zinc-900 mb-3">Analysis Findings</h4>
                <div className="space-y-2">
                    {findings.map((finding, idx) => (
                        <div
                            key={idx}
                            className={cn(
                                "p-3 rounded-lg border",
                                finding.status === 'critical'
                                    ? "bg-red-50 border-red-200"
                                    : finding.status === 'warning'
                                    ? "bg-amber-50 border-amber-200"
                                    : "bg-emerald-50 border-emerald-200"
                            )}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                {finding.status === 'critical' ? (
                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                ) : finding.status === 'warning' ? (
                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                ) : (
                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                )}
                                <span className="font-medium text-zinc-900">
                                    {finding.component}
                                </span>
                            </div>
                            <p className="text-sm text-zinc-600 ml-6">
                                {finding.message}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Documents Tab Component
function DocumentsTab({ aircraftId }: { aircraftId: string }) {
    const { data: documents, isLoading } = useParsedDocuments({ aircraftId });
    const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

    if (isLoading) {
        return (
            <div className="p-8 text-center">
                <RefreshCw className="w-8 h-8 text-zinc-400 mx-auto animate-spin" />
                <p className="text-sm text-zinc-500 mt-2">Loading documents...</p>
            </div>
        );
    }

    const linkedDocs = documents?.filter((doc: any) => doc.status === 'completed') || [];

    if (linkedDocs.length === 0) {
        return (
            <div className="p-8 text-center">
                <FileText className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                <p className="text-zinc-600 font-medium">No Documents Linked</p>
                <p className="text-sm text-zinc-500 mt-1">
                    Upload logbooks from the Files page and link them to this aircraft
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="font-semibold text-zinc-900">Linked Documents</h4>
                <Badge variant="secondary">{linkedDocs.length} documents</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {linkedDocs.map((doc: any) => {
                    const isExpanded = expandedDoc === doc._id;
                    const entries = doc.entries || [];

                    return (
                        <div
                            key={doc._id}
                            className="bg-zinc-50 rounded-lg border border-zinc-200 overflow-hidden hover:border-zinc-300 transition-colors"
                        >
                            {/* Document Header */}
                            <div
                                className="p-4 cursor-pointer"
                                onClick={() => setExpandedDoc(isExpanded ? null : doc._id)}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-blue-100 rounded-lg">
                                        <FileText className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h5 className="text-sm font-medium text-zinc-900 truncate">
                                            {doc.originalFilename || doc.filename}
                                        </h5>
                                        <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                                            <Badge variant="outline" className="text-xs">
                                                {doc.documentType?.replace(/_/g, ' ')}
                                            </Badge>
                                            <span>{entries.length} entries</span>
                                        </div>
                                        {doc.summary?.dateRange && (
                                            <p className="text-xs text-zinc-500 mt-1">
                                                {doc.summary.dateRange.from} to {doc.summary.dateRange.to}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center">
                                        {isExpanded ? (
                                            <ChevronUp className="w-5 h-5 text-zinc-400" />
                                        ) : (
                                            <ChevronDown className="w-5 h-5 text-zinc-400" />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Entries */}
                            {isExpanded && entries.length > 0 && (
                                <div className="border-t border-zinc-200 max-h-64 overflow-y-auto">
                                    {entries.slice(0, 20).map((entry: any, idx: number) => (
                                        <div
                                            key={idx}
                                            className="p-3 border-b border-zinc-100 last:border-b-0"
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-medium text-zinc-700">
                                                    {entry.date || 'No date'}
                                                </span>
                                                <div className="flex items-center gap-2 text-xs text-zinc-500">
                                                    {entry.tachTime > 0 && <span>Tach: {entry.tachTime}</span>}
                                                    {entry.hobbsTime > 0 && <span>Hobbs: {entry.hobbsTime}</span>}
                                                </div>
                                            </div>
                                            <p className="text-xs text-zinc-600 line-clamp-2">
                                                {entry.description || entry.remarks || entry.workPerformed || 'No description'}
                                            </p>
                                        </div>
                                    ))}
                                    {entries.length > 20 && (
                                        <p className="text-xs text-center text-zinc-500 py-2">
                                            Showing 20 of {entries.length} entries
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function MaintenanceHistorySection({ aircraftId, aircraftLogs }: { aircraftId: string; aircraftLogs?: any[] }) {
    const { data: documents, isLoading } = useParsedDocuments({ aircraftId });

    // Combine entries from aircraft logs and linked documents
    const allEntries: any[] = [];

    // Add aircraft logs
    if (aircraftLogs && aircraftLogs.length > 0) {
        allEntries.push(...aircraftLogs.map(log => ({
            ...log,
            source: 'aircraft',
        })));
    }

    // Add entries from linked documents
    const linkedDocs = documents?.filter((doc: any) => doc.status === 'completed') || [];
    for (const doc of linkedDocs) {
        if (doc.entries && doc.entries.length > 0) {
            allEntries.push(...doc.entries.map((entry: any) => ({
                date: entry.date,
                description: entry.description || entry.workPerformed || entry.remarks || 'Maintenance entry',
                hobbsTime: entry.hobbsTime || entry.hobbs || 0,
                tachTime: entry.tachTime || entry.tach || 0,
                mechanic: entry.mechanic || entry.signedBy,
                category: entry.category,
                source: 'document',
                docName: doc.originalFilename || doc.filename,
            })));
        }
    }

    // Sort by date (newest first)
    allEntries.sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime();
        const dateB = new Date(b.date || 0).getTime();
        return dateB - dateA;
    });

    if (isLoading) {
        return (
            <div>
                <h4 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                    <History className="w-4 h-4" /> Maintenance History
                </h4>
                <div className="p-4 bg-zinc-50 rounded-lg text-center">
                    <RefreshCw className="w-6 h-6 text-zinc-400 mx-auto animate-spin" />
                </div>
            </div>
        );
    }

    return (
        <div>
            <h4 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                <History className="w-4 h-4" /> Maintenance History
                {allEntries.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{allEntries.length}</Badge>
                )}
            </h4>
            {allEntries.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                    {allEntries.slice(0, 30).map((entry, idx) => (
                        <div
                            key={idx}
                            className="p-3 bg-zinc-50 rounded-lg border border-zinc-200"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-zinc-900">
                                    {entry.date ? new Date(entry.date).toLocaleDateString() : 'No date'}
                                </span>
                                <div className="flex items-center gap-2 text-xs text-zinc-500">
                                    {entry.tachTime > 0 && <span>Tach: {typeof entry.tachTime === 'number' ? entry.tachTime.toFixed(1) : entry.tachTime}</span>}
                                    {entry.hobbsTime > 0 && <span>Hobbs: {typeof entry.hobbsTime === 'number' ? entry.hobbsTime.toFixed(1) : entry.hobbsTime}</span>}
                                </div>
                            </div>
                            <p className="text-sm text-zinc-600 line-clamp-2">
                                {entry.description}
                            </p>
                            {entry.mechanic && (
                                <p className="text-xs text-zinc-400 mt-1">
                                    Mechanic: {entry.mechanic}
                                </p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                                {entry.category && (
                                    <Badge variant="outline" className="text-xs">
                                        {entry.category}
                                    </Badge>
                                )}
                                {entry.source === 'document' && entry.docName && (
                                    <span className="text-xs text-blue-500 truncate max-w-[150px]">
                                        from {entry.docName}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                    {allEntries.length > 30 && (
                        <p className="text-xs text-center text-zinc-500 py-2">
                            Showing 30 of {allEntries.length} entries
                        </p>
                    )}
                </div>
            ) : (
                <div className="p-4 bg-zinc-50 rounded-lg text-center">
                    <History className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500">
                        No maintenance history available
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">
                        Upload a maintenance logbook to see history
                    </p>
                </div>
            )}
        </div>
    );
}

function AddAircraftModal({
    onClose,
    onCreated,
    createAircraft,
}: {
    onClose: () => void;
    onCreated: () => void;
    createAircraft: any;
}) {
    const [tailNumber, setTailNumber] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!tailNumber.trim()) {
            setError('Tail number is required');
            return;
        }

        // Send only tail number - backend will auto-fetch from FAA Registry via Firecrawl
        createAircraft.mutate({ tailNumber: tailNumber.toUpperCase() }, {
            onSuccess: onCreated,
            onError: (err: Error) => {
                setError(err.message || 'Failed to add aircraft. Check if the tail number is valid.');
            },
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
                <h2 className="text-lg font-bold text-zinc-900 mb-2">Add Aircraft</h2>
                <p className="text-sm text-zinc-500 mb-4">
                    Enter the tail number and we'll automatically fetch aircraft details from the FAA registry.
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">
                            Tail Number
                        </label>
                        <input
                            type="text"
                            value={tailNumber}
                            onChange={(e) => setTailNumber(e.target.value.toUpperCase())}
                            className="w-full px-4 py-3 border border-zinc-300 rounded-lg bg-white text-zinc-900 uppercase text-lg font-mono tracking-wider"
                            placeholder="N12345"
                            autoFocus
                            disabled={createAircraft.isPending}
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-600">{error}</p>
                        </div>
                    )}

                    {createAircraft.isPending && (
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center gap-3">
                                <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                                <div>
                                    <p className="text-sm font-medium text-blue-700">
                                        Looking up aircraft...
                                    </p>
                                    <p className="text-xs text-blue-600">
                                        Fetching from FAA Registry & scraping aircraft data
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="flex-1"
                            disabled={createAircraft.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={createAircraft.isPending || !tailNumber.trim()}
                            className="flex-1"
                        >
                            {createAircraft.isPending ? (
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Plus className="w-4 h-4 mr-2" />
                            )}
                            Add Aircraft
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
