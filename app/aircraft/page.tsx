'use client';

import { useState, useEffect } from 'react';
import { Plane, Plus, AlertTriangle, CheckCircle, Wrench, Trash2, RefreshCw, Clock, Shield, History, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { useAircraft, useCreateAircraft, useDeleteAircraft, useParsedDocuments, useGenerateSafetyAnalysis } from '@/lib/hooks';
import type { Aircraft } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSkeleton';
import { cn, getDaysUntil } from '@/lib/utils';

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
    const generateSafetyAnalysis = useGenerateSafetyAnalysis();

    const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);

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
            <p className="text-zinc-600 dark:text-zinc-400">Failed to load aircraft</p>
        </div>
    );

    const maintenanceDue = fleet?.filter(ac => getDaysUntil(ac.maintenanceDates?.annual) < 30).length || 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Aircraft</h1>
                    <p className="text-zinc-500 dark:text-zinc-400">Manage your fleet</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => refetch()}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                    <Button onClick={() => setShowAddModal(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Aircraft
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Total Aircraft</p>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{fleet?.length || 0}</p>
                </div>
                <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Maintenance Due</p>
                    <p className={cn("text-2xl font-bold", maintenanceDue > 0 ? "text-amber-500" : "text-zinc-900 dark:text-zinc-100")}>
                        {maintenanceDue}
                    </p>
                </div>
                <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Total Hours</p>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                        {fleet?.reduce((acc, curr) => {
                            const hobbsInfo = getDisplayHobbs(curr.currentHours?.hobbs, curr.currentHours?.tach);
                            return acc + hobbsInfo.value;
                        }, 0).toFixed(0) || '0'}
                    </p>
                </div>
                <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">All Current</p>
                    <p className="text-2xl font-bold text-emerald-500">
                        {(fleet?.length || 0) - maintenanceDue}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Aircraft List */}
                <div className="lg:col-span-1">
                    <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                        <div className="p-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Fleet</h3>
                        </div>
                        <div className="max-h-[500px] overflow-y-auto">
                            {fleet?.map((ac) => {
                                const isSelected = selectedAircraft?._id === ac._id;
                                const annualStatus = getMaintenanceStatus(ac.maintenanceDates?.annual);

                                return (
                                    <div
                                        key={ac._id}
                                        onClick={() => setSelectedAircraft(ac)}
                                        className={cn(
                                            "p-4 border-b border-zinc-100 dark:border-zinc-700 cursor-pointer transition-colors",
                                            isSelected
                                                ? "bg-blue-50 dark:bg-blue-900/30"
                                                : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                                        )}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-zinc-900 dark:text-zinc-100">{ac.tailNumber}</span>
                                            {getDaysUntil(ac.maintenanceDates?.annual) < 30 && (
                                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                            )}
                                        </div>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{ac.model}</p>
                                        <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500 dark:text-zinc-400">
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
                                    <Plane className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                                    <p className="text-zinc-500 dark:text-zinc-400">No aircraft added yet</p>
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
                <div className="lg:col-span-2">
                    <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 min-h-[500px]">
                        {selectedAircraft ? (
                            <div className="h-full flex flex-col">
                                {/* Header */}
                                <div className="p-6 border-b border-zinc-200 dark:border-zinc-700">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                                                <Plane className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{selectedAircraft.tailNumber}</h2>
                                                <p className="text-zinc-500 dark:text-zinc-400">{selectedAircraft.year} {selectedAircraft.manufacturer} {selectedAircraft.model}</p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowDeleteModal(true)}
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                                    {/* Times */}
                                    <div>
                                        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                                            <Clock className="w-4 h-4" /> Aircraft Times
                                        </h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            {(() => {
                                                const hobbsInfo = getDisplayHobbs(
                                                    selectedAircraft.currentHours?.hobbs,
                                                    selectedAircraft.currentHours?.tach
                                                );
                                                return (
                                                    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
                                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase flex items-center gap-1">
                                                            Hobbs
                                                            {hobbsInfo.isEstimated && (
                                                                <span className="text-amber-500">(est.)</span>
                                                            )}
                                                        </p>
                                                        <p className={cn(
                                                            "text-2xl font-bold",
                                                            hobbsInfo.isEstimated
                                                                ? "text-amber-600 dark:text-amber-400"
                                                                : "text-zinc-900 dark:text-zinc-100"
                                                        )}>
                                                            {hobbsInfo.value.toFixed(1)}
                                                        </p>
                                                        {hobbsInfo.isEstimated && (
                                                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                                                Based on Tach × 1.1
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase">Tach</p>
                                                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{selectedAircraft.currentHours?.tach?.toFixed(1) || 0}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Maintenance */}
                                    <div>
                                        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                                            <Wrench className="w-4 h-4" /> Maintenance Status
                                        </h4>
                                        <div className="space-y-3">
                                            {[
                                                { label: 'Annual Inspection', date: selectedAircraft.maintenanceDates?.annual },
                                                { label: 'Transponder Check', date: selectedAircraft.maintenanceDates?.transponder },
                                                { label: 'Pitot-Static', date: selectedAircraft.maintenanceDates?.staticSystem },
                                            ].filter(item => item.date).map((item) => {
                                                const status = getMaintenanceStatus(item.date!);
                                                return (
                                                    <div key={item.label} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                                                        <span className="text-zinc-700 dark:text-zinc-300">{item.label}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm text-zinc-500 dark:text-zinc-400">
                                                                {new Date(item.date!).toLocaleDateString()}
                                                            </span>
                                                            <Badge variant={status.badge as any}>{status.text}</Badge>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Details */}
                                    <div>
                                        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Details</h4>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                                                <p className="text-zinc-500 dark:text-zinc-400">Serial</p>
                                                <p className="font-medium text-zinc-900 dark:text-zinc-100">{selectedAircraft.serial || 'N/A'}</p>
                                            </div>
                                            <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                                                <p className="text-zinc-500 dark:text-zinc-400">Year</p>
                                                <p className="font-medium text-zinc-900 dark:text-zinc-100">{selectedAircraft.year || 'N/A'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Safety Analysis */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                                <Shield className="w-4 h-4" /> Safety Analysis
                                            </h4>
                                            {selectedAircraft.safetyAnalysis && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setIsGeneratingAnalysis(true);
                                                        generateSafetyAnalysis.mutate(selectedAircraft._id, {
                                                            onSuccess: () => {
                                                                refetch();
                                                                setIsGeneratingAnalysis(false);
                                                            },
                                                            onError: () => setIsGeneratingAnalysis(false),
                                                        });
                                                    }}
                                                    disabled={isGeneratingAnalysis}
                                                    className="text-xs"
                                                >
                                                    {isGeneratingAnalysis ? (
                                                        <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                                                    ) : (
                                                        <RefreshCw className="w-3 h-3 mr-1" />
                                                    )}
                                                    Regenerate
                                                </Button>
                                            )}
                                        </div>
                                        {isGeneratingAnalysis ? (
                                            <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-center">
                                                <RefreshCw className="w-8 h-8 text-blue-500 mx-auto mb-2 animate-spin" />
                                                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                                    Generating safety analysis...
                                                </p>
                                            </div>
                                        ) : selectedAircraft.safetyAnalysis?.findings && selectedAircraft.safetyAnalysis.findings.length > 0 ? (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="text-sm text-zinc-500 dark:text-zinc-400">
                                                        Last analyzed: {new Date(selectedAircraft.safetyAnalysis.lastAnalyzed).toLocaleDateString()}
                                                    </span>
                                                    <Badge variant={
                                                        selectedAircraft.safetyAnalysis.score >= 80 ? 'success' :
                                                        selectedAircraft.safetyAnalysis.score >= 60 ? 'warning' : 'destructive'
                                                    }>
                                                        Score: {selectedAircraft.safetyAnalysis.score}
                                                    </Badge>
                                                </div>
                                                {selectedAircraft.safetyAnalysis.findings.map((finding, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={cn(
                                                            "p-3 rounded-lg border",
                                                            finding.status === 'critical'
                                                                ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                                                                : finding.status === 'warning'
                                                                ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                                                                : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
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
                                                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                                                {finding.component}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-zinc-600 dark:text-zinc-400 ml-6">
                                                            {finding.message}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-center">
                                                <Shield className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                                                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                                    No safety analysis available
                                                </p>
                                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                                                    Upload maintenance logs to generate analysis
                                                </p>
                                                {(selectedAircraft.logs?.length > 0 || (selectedAircraft.logbooks && Object.values(selectedAircraft.logbooks).some(arr => arr && arr.length > 0))) && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="mt-3"
                                                        onClick={() => {
                                                            setIsGeneratingAnalysis(true);
                                                            generateSafetyAnalysis.mutate(selectedAircraft._id, {
                                                                onSuccess: () => {
                                                                    refetch();
                                                                    setIsGeneratingAnalysis(false);
                                                                },
                                                                onError: () => setIsGeneratingAnalysis(false),
                                                            });
                                                        }}
                                                    >
                                                        <Shield className="w-4 h-4 mr-2" />
                                                        Generate Analysis
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Maintenance History */}
                                    <MaintenanceHistorySection
                                        aircraftId={selectedAircraft._id}
                                        aircraftLogs={selectedAircraft.logs}
                                    />

                                    {/* Linked Documents */}
                                    <LinkedDocumentsSection aircraftId={selectedAircraft._id} />
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8">
                                <Plane className="w-12 h-12 text-zinc-300 dark:text-zinc-600 mb-4" />
                                <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">No Aircraft Selected</h3>
                                <p className="text-zinc-500 dark:text-zinc-400 mt-2">Select an aircraft to view details</p>
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
                    <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-sm shadow-xl">
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">Delete Aircraft?</h3>
                        <p className="text-zinc-600 dark:text-zinc-400 mb-6">
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
                <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                    <History className="w-4 h-4" /> Maintenance History
                </h4>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-center">
                    <RefreshCw className="w-6 h-6 text-zinc-400 mx-auto animate-spin" />
                </div>
            </div>
        );
    }

    return (
        <div>
            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
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
                            className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700"
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                    {entry.date ? new Date(entry.date).toLocaleDateString() : 'No date'}
                                </span>
                                <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                                    {entry.tachTime > 0 && <span>Tach: {typeof entry.tachTime === 'number' ? entry.tachTime.toFixed(1) : entry.tachTime}</span>}
                                    {entry.hobbsTime > 0 && <span>Hobbs: {typeof entry.hobbsTime === 'number' ? entry.hobbsTime.toFixed(1) : entry.hobbsTime}</span>}
                                </div>
                            </div>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2">
                                {entry.description}
                            </p>
                            {entry.mechanic && (
                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
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
                                    <span className="text-xs text-blue-500 dark:text-blue-400 truncate max-w-[150px]">
                                        from {entry.docName}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                    {allEntries.length > 30 && (
                        <p className="text-xs text-center text-zinc-500 dark:text-zinc-400 py-2">
                            Showing 30 of {allEntries.length} entries
                        </p>
                    )}
                </div>
            ) : (
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-center">
                    <History className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        No maintenance history available
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                        Upload a maintenance logbook to see history
                    </p>
                </div>
            )}
        </div>
    );
}

function LinkedDocumentsSection({ aircraftId }: { aircraftId: string }) {
    const { data: documents, isLoading } = useParsedDocuments({ aircraftId });
    const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

    if (isLoading) {
        return (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-center">
                <RefreshCw className="w-6 h-6 text-zinc-400 mx-auto animate-spin" />
            </div>
        );
    }

    const linkedDocs = documents?.filter((doc: any) => doc.status === 'completed') || [];

    return (
        <div>
            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Linked Documents
                {linkedDocs.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{linkedDocs.length}</Badge>
                )}
            </h4>
            {linkedDocs.length > 0 ? (
                <div className="space-y-2">
                    {linkedDocs.map((doc: any) => {
                        const isExpanded = expandedDoc === doc._id;
                        const entries = doc.entries || [];

                        return (
                            <div
                                key={doc._id}
                                className="bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden"
                            >
                                {/* Document Header */}
                                <div
                                    className="p-3 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                    onClick={() => setExpandedDoc(isExpanded ? null : doc._id)}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-blue-500" />
                                            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[200px]">
                                                {doc.originalFilename || doc.filename}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-xs">
                                                {entries.length} entries
                                            </Badge>
                                            {isExpanded ? (
                                                <ChevronUp className="w-4 h-4 text-zinc-400" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-zinc-400" />
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                        <span>{doc.documentType?.replace(/_/g, ' ')}</span>
                                        {doc.summary?.dateRange && (
                                            <span>
                                                {doc.summary.dateRange.from} - {doc.summary.dateRange.to}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Expanded Entries */}
                                {isExpanded && entries.length > 0 && (
                                    <div className="border-t border-zinc-200 dark:border-zinc-700 max-h-64 overflow-y-auto">
                                        {entries.slice(0, 50).map((entry: any, idx: number) => (
                                            <div
                                                key={idx}
                                                className="p-3 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0"
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                                        {entry.date || 'No date'}
                                                    </span>
                                                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                                                        {entry.tachTime > 0 && <span>Tach: {entry.tachTime}</span>}
                                                        {entry.hobbsTime > 0 && <span>Hobbs: {entry.hobbsTime}</span>}
                                                        {entry.totalTime > 0 && <span>{entry.totalTime}h</span>}
                                                    </div>
                                                </div>
                                                <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                                                    {entry.description || entry.remarks || entry.workPerformed || 'No description'}
                                                </p>
                                                {entry.mechanic && (
                                                    <p className="text-xs text-zinc-400 mt-1">
                                                        Mechanic: {entry.mechanic}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                        {entries.length > 50 && (
                                            <p className="text-xs text-center text-zinc-500 py-2">
                                                Showing 50 of {entries.length} entries
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-center">
                    <FileText className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        No linked documents
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                        Upload logbooks from the Files page and link them to this aircraft
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
    const [formData, setFormData] = useState({
        tailNumber: '',
        model: '',
        manufacturer: '',
        year: new Date().getFullYear(),
        serial: '',
        hobbs: 0,
        tach: 0,
        annual: new Date().toISOString().split('T')[0],
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createAircraft.mutate({
            tailNumber: formData.tailNumber,
            model: formData.model,
            manufacturer: formData.manufacturer,
            year: formData.year,
            serial: formData.serial,
            currentHours: {
                hobbs: formData.hobbs,
                tach: formData.tach,
            },
            maintenanceDates: {
                annual: formData.annual,
                transponder: formData.annual,
                staticSystem: formData.annual,
            },
        }, {
            onSuccess: onCreated,
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-md shadow-xl">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">Add Aircraft</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Tail Number</label>
                            <input
                                type="text"
                                value={formData.tailNumber}
                                onChange={(e) => setFormData({ ...formData, tailNumber: e.target.value.toUpperCase() })}
                                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 uppercase"
                                placeholder="N12345"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Model</label>
                            <input
                                type="text"
                                value={formData.model}
                                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                                placeholder="172S"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Manufacturer</label>
                            <input
                                type="text"
                                value={formData.manufacturer}
                                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                                placeholder="Cessna"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Year</label>
                            <input
                                type="number"
                                value={formData.year}
                                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Serial Number</label>
                        <input
                            type="text"
                            value={formData.serial}
                            onChange={(e) => setFormData({ ...formData, serial: e.target.value })}
                            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Hobbs Time</label>
                            <input
                                type="number"
                                step="0.1"
                                value={formData.hobbs}
                                onChange={(e) => setFormData({ ...formData, hobbs: parseFloat(e.target.value) || 0 })}
                                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Tach Time</label>
                            <input
                                type="number"
                                step="0.1"
                                value={formData.tach}
                                onChange={(e) => setFormData({ ...formData, tach: parseFloat(e.target.value) || 0 })}
                                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Annual Due Date</label>
                        <input
                            type="date"
                            value={formData.annual}
                            onChange={(e) => setFormData({ ...formData, annual: e.target.value })}
                            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                            required
                        />
                    </div>

                    <div className="flex gap-3 pt-4">
                        <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                            Cancel
                        </Button>
                        <Button type="submit" disabled={createAircraft.isPending} className="flex-1">
                            {createAircraft.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                            Add Aircraft
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
