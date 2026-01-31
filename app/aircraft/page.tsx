'use client';

import { useState, useEffect } from 'react';
import { Plane, Plus, AlertTriangle, CheckCircle, Clock, Wrench, Trash2, X, FileText, Loader2, Image as ImageIcon, Link2, Search, ShieldCheck, Microscope, Sparkles, ChevronDown, Settings, Cog, Radio, BookOpen, ExternalLink } from 'lucide-react';
import { useAircraft, useCreateAircraft, useDeleteAircraft, useParsedDocuments, useAircraftById } from '@/lib/hooks';
import Link from 'next/link';
import type { Aircraft } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { MetricCard } from '@/components/ui/MetricCard';
import { MaintenanceItem } from '@/components/ui/MaintenanceStatus';
import { LoadingSpinner } from '@/components/ui/LoadingSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn, getDaysUntil } from '@/lib/utils';

type LogbookCategory = 'engine' | 'airframe' | 'propeller' | 'avionics';

export default function AircraftPage() {
    const { data: fleet, isLoading, error, refetch } = useAircraft();
    const createAircraft = useCreateAircraft();
    const deleteAircraft = useDeleteAircraft();
    const { data: parsedDocs, refetch: refetchDocs } = useParsedDocuments({ documentType: 'maintenance' });

    const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(null);
    const { data: fullAircraftData } = useAircraftById(selectedAircraftId || '');

    // Merge: prefer full data, fallback to basic list data for instant UI feedback
    const selectedAircraft = (fullAircraftData || fleet?.find((ac: Aircraft) => ac._id === selectedAircraftId)) as Aircraft | null;

    const [showAddModal, setShowAddModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'logbooks' | 'analysis'>('details');
    const [logbookCategory, setLogbookCategory] = useState<LogbookCategory>('airframe');
    const [logbookYear, setLogbookYear] = useState<string>('All');

    useEffect(() => {
        setLogbookYear('All');
    }, [selectedAircraft?._id]);

    // Auto-refresh when documents are being parsed
    const parsingDocsCount = parsedDocs?.filter((d: any) => d.status === 'parsing').length || 0;
    useEffect(() => {
        if (parsingDocsCount > 0) {
            const interval = setInterval(() => {
                refetch();
                refetchDocs();
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [parsingDocsCount, refetch, refetchDocs]);

    // Get logs from the categorized logbooks or fallback to legacy logs array
    const getCategoryLogs = (category: LogbookCategory) => {
        if (selectedAircraft?.logbooks?.[category]?.length) {
            return selectedAircraft.logbooks[category];
        }
        // Fallback: filter legacy logs by category if present, otherwise show all
        return (selectedAircraft?.logs || []).filter(
            (l: any) => !l.category || l.category === category
        );
    };

    const currentCategoryLogs = getCategoryLogs(logbookCategory);
    const years = Array.from(new Set(currentCategoryLogs.map((l: any) => new Date(l.date).getFullYear()))).sort((a, b) => b - a);
    const filteredLogs = logbookYear === 'All'
        ? currentCategoryLogs
        : currentCategoryLogs.filter((l: any) => new Date(l.date).getFullYear() === parseInt(logbookYear));

    // Document linking is now done from the Files page

    if (isLoading) return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div></div>;
    if (error) return <div className="text-center py-12"><AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" /><p className="text-zinc-600">Failed to load aircraft fleet.</p></div>;

    const fleetSize = fleet?.length || 0;
    const maintenanceDue = fleet?.filter(ac => getDaysUntil(ac.maintenanceDates.annual) < 30).length || 0;

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-4 flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Fleet Management</h1>
                    <p className="text-sm text-zinc-500">Track airworthiness, maintenance, and logbooks.</p>
                </div>
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Aircraft
                </Button>
            </div>

            {/* Stats Row */}
            <div className="grid gap-4 md:grid-cols-4 flex-shrink-0">
                <MetricCard label="Active Fleet" value={fleetSize} />
                <MetricCard label="Maintenance Due" value={maintenanceDue} className={maintenanceDue > 0 ? "border-l-4 border-l-red-500" : ""} />
                <MetricCard label="Total Fleet Hours" value={fleet?.reduce((acc, curr) => acc + curr.currentHours.hobbs, 0).toFixed(1) || '0.0'} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                {/* Aircraft List */}
                <div className="lg:col-span-1 border border-zinc-200 rounded-xl bg-white flex flex-col overflow-hidden shadow-sm">
                    <div className="p-3 border-b border-zinc-100 bg-zinc-50/50">
                        <input
                            type="text"
                            placeholder="Search tail number..."
                            className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                    </div>
                    <div className="overflow-y-auto flex-1 p-2 space-y-1">
                        {fleet?.map((ac) => {
                            const annualDays = getDaysUntil(ac.maintenanceDates.annual);
                            const isMaintenanceDue = annualDays < 30;
                            const isSelected = selectedAircraft?._id === ac._id;

                            return (
                                <div
                                    key={ac._id}
                                    onClick={() => { setSelectedAircraftId(ac._id); setActiveTab('details'); }}
                                    className={cn(
                                        "group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border border-transparent",
                                        isSelected ? "bg-blue-50 border-blue-200 shadow-sm" : "hover:bg-zinc-50 hover:border-zinc-200"
                                    )}
                                >
                                    {/* Aircraft Image Thumbnail */}
                                    <div className={cn(
                                        "w-12 h-12 rounded-lg flex items-center justify-center border overflow-hidden",
                                        isSelected ? "border-blue-200" : "border-zinc-200"
                                    )}>
                                        {ac.imageUrl ? (
                                            <img src={ac.imageUrl} alt={ac.tailNumber} className="w-full h-full object-cover" />
                                        ) : (
                                            <Plane className={cn("w-5 h-5", isSelected ? "text-blue-600" : "text-zinc-400")} />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <h3 className={cn("font-bold text-sm", isSelected ? "text-blue-900" : "text-zinc-900")}>{ac.tailNumber}</h3>
                                            {isMaintenanceDue && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                            <p className="text-xs text-zinc-500 truncate">{ac.model}</p>
                                            <span className="text-[10px] font-mono text-zinc-400">{ac.currentHours.hobbs} HOBBS</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Aircraft Details Panel */}
                <div className="lg:col-span-2 border border-zinc-200 rounded-xl bg-white flex flex-col shadow-sm overflow-hidden">
                    {selectedAircraft ? (
                        <>
                            {/* Detail Header with Image */}
                            <div className="p-6 border-b border-zinc-100 flex items-start justify-between bg-zinc-50/30">
                                <div className="flex items-center gap-4">
                                    <div className="w-20 h-20 bg-white border border-zinc-200 rounded-xl flex items-center justify-center shadow-sm overflow-hidden">
                                        {selectedAircraft.imageUrl ? (
                                            <img src={selectedAircraft.imageUrl} alt={selectedAircraft.tailNumber} className="w-full h-full object-cover" />
                                        ) : (
                                            <Plane className="w-10 h-10 text-zinc-300" />
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-zinc-900">{selectedAircraft.tailNumber}</h2>
                                        <p className="text-sm text-zinc-500 font-medium">{selectedAircraft.year} {selectedAircraft.manufacturer} {selectedAircraft.model}</p>
                                        <div className="flex gap-2 mt-2">
                                            <Badge variant="outline" className="font-mono">SN: {selectedAircraft.serial}</Badge>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => setShowDeleteModal(true)}>
                                        <Trash2 className="w-4 h-4 text-zinc-400 hover:text-red-500" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => setSelectedAircraftId(null)}>
                                        <X className="w-4 h-4 text-zinc-400" />
                                    </Button>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-zinc-100 px-2">
                                <button
                                    onClick={() => setActiveTab('details')}
                                    className={cn(
                                        "px-4 py-3 text-sm font-medium transition-colors flex items-center gap-2",
                                        activeTab === 'details' ? "text-blue-600 border-b-2 border-blue-600" : "text-zinc-500 hover:text-zinc-700"
                                    )}
                                >
                                    <Settings className="w-4 h-4" />
                                    Details
                                </button>
                                <button
                                    onClick={() => setActiveTab('logbooks')}
                                    className={cn(
                                        "px-4 py-3 text-sm font-medium transition-colors flex items-center gap-2",
                                        activeTab === 'logbooks' ? "text-indigo-600 border-b-2 border-indigo-600" : "text-zinc-500 hover:text-zinc-700"
                                    )}
                                >
                                    <BookOpen className="w-4 h-4" />
                                    Logbooks
                                </button>
                                <button
                                    onClick={() => setActiveTab('analysis')}
                                    className={cn(
                                        "px-4 py-3 text-sm font-medium transition-colors flex items-center gap-2",
                                        activeTab === 'analysis' ? "text-orange-600 border-b-2 border-orange-600" : "text-zinc-500 hover:text-zinc-700"
                                    )}
                                >
                                    <Sparkles className="w-4 h-4" />
                                    AI Risk Analysis
                                </button>
                            </div>

                            {/* Content Area */}
                            <div className="p-6 overflow-y-auto flex-1 bg-zinc-50/50 space-y-6">
                                {activeTab === 'details' ? (
                                    <>
                                        {/* Times */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-white rounded-lg border border-zinc-200 shadow-sm">
                                                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Hobbs Time</div>
                                                <div className="text-3xl font-bold tabular-nums text-zinc-900">{selectedAircraft.currentHours.hobbs.toFixed(1)}</div>
                                            </div>
                                            <div className="p-4 bg-white rounded-lg border border-zinc-200 shadow-sm">
                                                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Tach Time</div>
                                                <div className="text-3xl font-bold tabular-nums text-zinc-900">{selectedAircraft.currentHours.tach.toFixed(1)}</div>
                                            </div>
                                        </div>

                                        {/* Maintenance Status */}
                                        <div className="space-y-4">
                                            <h3 className="text-sm font-semibold text-zinc-900 flex items-center"><Wrench className="w-4 h-4 mr-2" /> Maintenance Status</h3>
                                            <div className="grid md:grid-cols-2 gap-4">
                                                <MaintenanceItem label="Annual Inspection" date={selectedAircraft.maintenanceDates.annual} />
                                                <MaintenanceItem label="Transponder Check" date={selectedAircraft.maintenanceDates.transponder} />
                                                <MaintenanceItem label="Pitot-Static" date={selectedAircraft.maintenanceDates.staticSystem} />
                                                {selectedAircraft.maintenanceDates.hundredHour && (
                                                    <MaintenanceItem label="100-Hour Inspection" date={selectedAircraft.maintenanceDates.hundredHour} />
                                                )}
                                            </div>
                                        </div>

                                        {/* Risk Indicators */}
                                        <div className="space-y-4">
                                            <h3 className="text-sm font-semibold text-zinc-900 flex items-center"><AlertTriangle className="w-4 h-4 mr-2" /> Component Risk</h3>
                                            <div className="grid md:grid-cols-2 gap-4">
                                                <RiskIndicator label="Alternator" hours={selectedAircraft.currentHours.hobbs} baselineHours={500} />
                                                <RiskIndicator label="Vacuum Pump" hours={selectedAircraft.currentHours.hobbs} baselineHours={400} />
                                                <RiskIndicator label="Magnetos" hours={selectedAircraft.currentHours.hobbs} baselineHours={500} />
                                                <RiskIndicator label="Engine" hours={selectedAircraft.currentHours.hobbs} baselineHours={2000} />
                                            </div>
                                        </div>
                                    </>
                                ) : activeTab === 'analysis' ? (
                                    <RiskAnalysisPanel aircraft={selectedAircraft} onAnalyze={() => { refetch(); }} />
                                ) : (
                                    <div className="space-y-6">
                                        {/* Logbook Category Selector */}
                                        <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-indigo-50 to-slate-50 rounded-xl border border-indigo-100">
                                            <div className="flex-1">
                                                <h3 className="text-sm font-bold text-indigo-900 mb-1">Logbook Category</h3>
                                                <p className="text-xs text-indigo-700/70">Select logbook type to view maintenance history</p>
                                            </div>
                                            <div className="flex gap-2">
                                                {[
                                                    { key: 'engine', label: 'Engine', icon: Cog },
                                                    { key: 'airframe', label: 'Airframe', icon: Plane },
                                                    { key: 'propeller', label: 'Propeller', icon: Settings },
                                                    { key: 'avionics', label: 'Avionics', icon: Radio },
                                                ].map(({ key, label, icon: Icon }) => (
                                                    <button
                                                        key={key}
                                                        onClick={() => { setLogbookCategory(key as LogbookCategory); setLogbookYear('All'); }}
                                                        className={cn(
                                                            "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                                                            logbookCategory === key
                                                                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                                                                : "bg-white text-zinc-600 border border-zinc-200 hover:border-indigo-300 hover:text-indigo-600"
                                                        )}
                                                    >
                                                        <Icon className="w-4 h-4" />
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Link to Files Page */}
                                        <Link
                                            href="/files"
                                            className="flex items-center justify-between p-4 bg-white border border-zinc-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 transition-colors">
                                                    <FileText className="w-5 h-5 text-indigo-600" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-zinc-900">Upload & Manage Documents</p>
                                                    <p className="text-sm text-zinc-500">Go to Files to upload maintenance logs and link them to this aircraft</p>
                                                </div>
                                            </div>
                                            <ExternalLink className="w-5 h-5 text-zinc-400 group-hover:text-indigo-500 transition-colors" />
                                        </Link>

                                        {/* Linked Files */}
                                        {parsedDocs && parsedDocs.filter(d => d.aircraft === selectedAircraft._id).length > 0 && (
                                            <div className="space-y-3">
                                                <h3 className="text-sm font-semibold text-zinc-900 flex items-center">
                                                    <Link2 className="w-4 h-4 mr-2" /> Linked Documents
                                                </h3>
                                                <div className="grid gap-3">
                                                    {parsedDocs.filter(d => d.aircraft === selectedAircraft._id).map((doc: any) => (
                                                        <div
                                                            key={doc._id}
                                                            className={cn(
                                                                "rounded-lg p-3 flex items-center justify-between",
                                                                doc.status === 'parsing'
                                                                    ? "bg-amber-50 border border-amber-200"
                                                                    : "bg-emerald-50 border border-emerald-200"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                {doc.status === 'parsing' ? (
                                                                    <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
                                                                ) : (
                                                                    <FileText className="w-5 h-5 text-emerald-600" />
                                                                )}
                                                                <div>
                                                                    <p className="text-sm font-medium text-zinc-900">{doc.filename}</p>
                                                                    <p className="text-xs text-zinc-500">
                                                                        {doc.status === 'parsing'
                                                                            ? 'Processing with Reducto AI...'
                                                                            : `${doc.summary?.totalEntries || 0} entries • ${doc.summary?.totalHours?.toFixed(1) || 0} hours`
                                                                        }
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <Badge variant={doc.status === 'completed' ? 'success' : doc.status === 'parsing' ? 'warning' : 'secondary'}>
                                                                {doc.status === 'parsing' ? (
                                                                    <span className="flex items-center gap-1">
                                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                                        Parsing
                                                                    </span>
                                                                ) : doc.status}
                                                            </Badge>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Category-specific Log Entries */}
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h3 className="text-sm font-semibold text-zinc-900 flex items-center">
                                                    <Clock className="w-4 h-4 mr-2" />
                                                    <span className="capitalize">{logbookCategory}</span> Maintenance History
                                                </h3>
                                                <select
                                                    className="h-8 pl-2 pr-8 text-xs bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm"
                                                    value={logbookYear}
                                                    onChange={(e) => setLogbookYear(e.target.value)}
                                                >
                                                    <option value="All">All Years</option>
                                                    {years.map(year => (
                                                        <option key={year} value={year}>{year}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {filteredLogs.length > 0 ? (
                                                <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden shadow-sm">
                                                    <table className="w-full text-sm">
                                                        <thead className="bg-zinc-50 border-b border-zinc-200">
                                                            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider">
                                                                <th className="px-4 py-3">Date</th>
                                                                <th className="px-4 py-3">Description</th>
                                                                <th className="px-4 py-3">Mechanic</th>
                                                                <th className="px-4 py-3 text-right">Hobbs</th>
                                                                <th className="px-4 py-3 text-right">Tach</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-zinc-100">
                                                            {filteredLogs.map((log: any, i: number) => (
                                                                <tr key={i} className="hover:bg-zinc-50 transition-colors">
                                                                    <td className="px-4 py-3 font-mono text-xs text-zinc-600 w-24">
                                                                        {new Date(log.date).toLocaleDateString()}
                                                                    </td>
                                                                    <td className="px-4 py-3 font-medium text-zinc-900">
                                                                        {log.description}
                                                                        {log.rawText && (
                                                                            <p className="text-xs text-zinc-400 font-normal mt-0.5 line-clamp-1">{log.rawText}</p>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-zinc-600 w-32">
                                                                        {log.mechanic ? (
                                                                            <Badge variant="outline" className="text-xs font-normal bg-white">
                                                                                {log.mechanic}
                                                                            </Badge>
                                                                        ) : '-'}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right font-mono text-zinc-700 w-24">
                                                                        {log.hobbsTime?.toFixed(1) || '-'}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right font-mono text-zinc-500 w-24">
                                                                        {log.tachTime?.toFixed(1) || '-'}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div className="p-12 text-center border-2 border-dashed border-zinc-200 rounded-xl bg-zinc-50/50">
                                                    <BookOpen className="w-12 h-12 mx-auto text-zinc-300 mb-3" />
                                                    <p className="text-zinc-600 font-medium">No {logbookCategory} entries found</p>
                                                    <p className="text-xs text-zinc-500 mt-1">Upload a {logbookCategory} logbook to populate history</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-zinc-50/50">
                            <div className="w-16 h-16 bg-white border border-zinc-200 rounded-full flex items-center justify-center shadow-sm mb-4">
                                <Plane className="w-8 h-8 text-zinc-300" />
                            </div>
                            <h3 className="text-lg font-medium text-zinc-900">No Aircraft Selected</h3>
                            <p className="text-zinc-500 max-w-xs mx-auto mt-2">Select an aircraft to view maintenance status, logbook, and risk analysis.</p>
                        </div>
                    )}
                </div>
            </div>

            {showAddModal && <AddAircraftModal onClose={() => setShowAddModal(false)} onCreate={(data) => createAircraft.mutate(data, { onSuccess: () => setShowAddModal(false) })} isLoading={createAircraft.isPending} />}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && selectedAircraft && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center gap-3 text-red-600 mb-4">
                            <div className="bg-red-50 p-2 rounded-full"><AlertTriangle className="w-6 h-6" /></div>
                            <h3 className="text-lg font-bold text-zinc-900">Remove Aircraft?</h3>
                        </div>
                        <p className="text-zinc-600 mb-6 text-sm">
                            Are you sure you want to remove <strong>{selectedAircraft.tailNumber}</strong>? This will also delete all associated maintenance logs.
                        </p>
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setShowDeleteModal(false)} disabled={deleteAircraft.isPending}>
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => {
                                    deleteAircraft.mutate(selectedAircraft._id, {
                                        onSuccess: () => {
                                            setShowDeleteModal(false);
                                            setSelectedAircraftId(null);
                                        }
                                    });
                                }}
                                disabled={deleteAircraft.isPending}
                            >
                                {deleteAircraft.isPending ? 'Removing...' : 'Remove Aircraft'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function RiskIndicator({ label, hours, baselineHours }: { label: string; hours: number; baselineHours: number }) {
    // Simple risk model: risk increases as hours approach typical overhaul interval
    const hoursSinceNew = hours % baselineHours; // Assume reset at each overhaul
    const riskPercent = Math.min(Math.round((hoursSinceNew / baselineHours) * 30), 30); // Max 30% risk
    const riskLevel = riskPercent < 10 ? 'low' : riskPercent < 20 ? 'medium' : 'high';

    return (
        <div className="p-3 bg-white border border-zinc-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-zinc-900">{label}</span>
                <Badge variant={riskLevel === 'low' ? 'secondary' : riskLevel === 'medium' ? 'warning' : 'destructive'} className="text-[10px]">
                    {riskPercent}% risk
                </Badge>
            </div>
            <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                    className={cn(
                        "h-full rounded-full transition-all",
                        riskLevel === 'low' ? 'bg-emerald-500' : riskLevel === 'medium' ? 'bg-amber-500' : 'bg-red-500'
                    )}
                    style={{ width: `${riskPercent}%` }}
                />
            </div>
            <p className="text-xs text-zinc-500 mt-1">{hoursSinceNew.toFixed(0)} hrs since overhaul</p>
        </div>
    );
}

function RiskAnalysisPanel({ aircraft, onAnalyze }: { aircraft: Aircraft; onAnalyze: () => void }) {
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleRunAnalysis = async () => {
        setIsAnalyzing(true);
        try {
            const res = await fetch(`/api/aircraft/${aircraft._id}/analyze`, { method: 'POST' });
            if (res.ok) {
                onAnalyze();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const analysis = aircraft.safetyAnalysis;

    return (
        <div className="space-y-6">
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-start justify-between">
                <div>
                    <h3 className="text-sm font-bold text-blue-900">AI Maintenance Analysis</h3>
                    <p className="text-xs text-blue-700 mt-1">
                        Scans linked logbooks for key component history (Magnetos, Vacuum Pumps, Cylinders) to identify overdue maintenance.
                    </p>
                </div>
                <Button size="sm" onClick={handleRunAnalysis} disabled={isAnalyzing}>
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                    {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
                </Button>
            </div>

            {analysis ? (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold">Last Analyzed: {new Date(analysis.lastAnalyzed).toLocaleDateString()}</h4>
                        <Badge variant={analysis.score > 8 ? 'success' : analysis.score > 5 ? 'warning' : 'destructive'}>
                            Safety Score: {analysis.score}/10
                        </Badge>
                    </div>

                    <div className="grid gap-3">
                        {analysis.findings.map((finding: any, i: number) => (
                            <div key={i} className={cn(
                                "p-3 rounded-lg border flex items-start gap-3",
                                finding.status === 'ok' ? "bg-white border-zinc-200" :
                                    finding.status === 'warning' ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"
                            )}>
                                {finding.status === 'ok' ? <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5" /> : <AlertTriangle className={cn("w-5 h-5 mt-0.5", finding.status === 'warning' ? "text-amber-500" : "text-red-500")} />}
                                <div>
                                    <p className="text-sm font-medium text-zinc-900">{finding.component}</p>
                                    <p className="text-sm text-zinc-600">{finding.message}</p>
                                    {finding.lastMentioned && (
                                        <p className="text-xs text-zinc-500 mt-1">Last seen: {new Date(finding.lastMentioned).toLocaleDateString()}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="text-center py-12 text-zinc-500">
                    <ShieldCheck className="w-12 h-12 mx-auto text-zinc-300 mb-2" />
                    <p>No analysis run yet.</p>
                </div>
            )}
        </div>
    );
}

function AddAircraftModal({ onClose, onCreate, isLoading }: { onClose: () => void; onCreate: (data: any) => void; isLoading: boolean }) {
    const [mode, setMode] = useState<'magic' | 'manual'>('magic');
    const [tailNumber, setTailNumber] = useState('');
    const [isMagicAdding, setIsMagicAdding] = useState(false);
    const [magicStatus, setMagicStatus] = useState<string | null>(null);
    const [magicError, setMagicError] = useState<string | null>(null);
    const [scrapedData, setScrapedData] = useState<any>(null);

    const [formData, setFormData] = useState({
        tailNumber: '', model: '', manufacturer: '', year: new Date().getFullYear(),
        serial: '', imageUrl: '',
        currentHours: { hobbs: 0, tach: 0 },
        maintenanceDates: {
            annual: new Date().toISOString().slice(0, 10),
            transponder: new Date().toISOString().slice(0, 10),
            staticSystem: new Date().toISOString().slice(0, 10)
        }
    });
    const [isLookingUp, setIsLookingUp] = useState(false);

    const handleMagicAdd = async () => {
        if (!tailNumber.trim()) return;

        setIsMagicAdding(true);
        setMagicError(null);
        setMagicStatus('Scraping FAA Registry...');

        try {
            // Simulate progressive status updates
            const statusUpdates = [
                'Scraping FAA Registry...',
                'Querying airworthiness database...',
                'Fetching aircraft specifications...',
                'Running AI enhancement (Gemini Pro 3)...',
                'Building MEL requirements...',
                'Finalizing aircraft profile...',
            ];

            let currentIndex = 0;
            const statusInterval = setInterval(() => {
                if (currentIndex < statusUpdates.length - 1) {
                    currentIndex++;
                    setMagicStatus(statusUpdates[currentIndex]);
                }
            }, 1500);

            const res = await fetch('/api/aircraft/magic-add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tailNumber: tailNumber.trim() }),
            });

            clearInterval(statusInterval);

            const data = await res.json();

            if (data.success) {
                setScrapedData(data.data);
                setMagicStatus('Aircraft added successfully!');
                // Close modal after brief success display
                setTimeout(() => {
                    onClose();
                    window.location.reload(); // Refresh to show new aircraft
                }, 1500);
            } else {
                setMagicError(data.error || 'Failed to add aircraft');
                setMagicStatus(null);
            }
        } catch (error) {
            setMagicError((error as Error).message || 'Network error');
            setMagicStatus(null);
        } finally {
            setIsMagicAdding(false);
        }
    };

    const handleLookup = async () => {
        if (!formData.tailNumber) return;
        setIsLookingUp(true);
        try {
            const res = await fetch(`/api/aircraft/lookup?tailNumber=${formData.tailNumber}`);
            const data = await res.json();
            if (data.success && data.data) {
                const ac = data.data;
                setFormData(prev => ({
                    ...prev,
                    model: ac.model || prev.model,
                    manufacturer: ac.manufacturer || prev.manufacturer,
                    year: ac.year || prev.year,
                    serial: ac.serial || prev.serial,
                    imageUrl: ac.imageUrl || prev.imageUrl
                }));
            }
        } catch (e) {
            console.error("Lookup failed", e);
        } finally {
            setIsLookingUp(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onCreate(formData);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-white/20">
                {/* Header */}
                <div className="p-6 border-b border-zinc-200/50 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-slate-50 rounded-t-2xl">
                    <div>
                        <h2 className="text-lg font-bold text-zinc-900">Add Aircraft</h2>
                        <p className="text-xs text-zinc-500 mt-0.5">Add to your fleet instantly</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
                </div>

                {/* Mode Selector */}
                <div className="p-4 border-b border-zinc-100 bg-zinc-50/50">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setMode('magic')}
                            className={cn(
                                "flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2",
                                mode === 'magic'
                                    ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-200"
                                    : "bg-white text-zinc-600 border border-zinc-200 hover:border-indigo-300"
                            )}
                        >
                            <Microscope className="w-4 h-4" />
                            Magic Add
                        </button>
                        <button
                            onClick={() => setMode('manual')}
                            className={cn(
                                "flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2",
                                mode === 'manual'
                                    ? "bg-zinc-800 text-white"
                                    : "bg-white text-zinc-600 border border-zinc-200 hover:border-zinc-400"
                            )}
                        >
                            <Settings className="w-4 h-4" />
                            Manual Entry
                        </button>
                    </div>
                </div>

                {mode === 'magic' ? (
                    <div className="p-6 space-y-6">
                        {/* Magic Add Hero */}
                        <div className="text-center py-4">
                            <div className="w-16 h-16 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-200">
                                <Sparkles className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-lg font-bold text-zinc-900">Zero-Question Add</h3>
                            <p className="text-sm text-zinc-500 mt-1 max-w-xs mx-auto">
                                Just enter the tail number. We'll scrape FAA data, fetch specs, and build the MEL automatically.
                            </p>
                        </div>

                        {/* Tail Number Input */}
                        <div className="space-y-3">
                            <label className="text-sm font-semibold text-zinc-700">Tail Number</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={tailNumber}
                                    onChange={(e) => setTailNumber(e.target.value.toUpperCase())}
                                    placeholder="N12345"
                                    disabled={isMagicAdding}
                                    className="w-full px-4 py-4 text-2xl font-mono font-bold text-center uppercase border-2 border-zinc-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all disabled:bg-zinc-100"
                                />
                                {isMagicAdding && (
                                    <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center">
                                        <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Status Display */}
                        {magicStatus && (
                            <div className={cn(
                                "p-4 rounded-xl flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-2",
                                scrapedData ? "bg-emerald-50 border border-emerald-200" : "bg-indigo-50 border border-indigo-200"
                            )}>
                                {scrapedData ? (
                                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                                ) : (
                                    <Microscope className="w-5 h-5 text-indigo-600 animate-pulse" />
                                )}
                                <div className="flex-1">
                                    <p className={cn(
                                        "text-sm font-medium",
                                        scrapedData ? "text-emerald-800" : "text-indigo-800"
                                    )}>
                                        {magicStatus}
                                    </p>
                                    {scrapedData && (
                                        <p className="text-xs text-emerald-600 mt-0.5">
                                            {scrapedData.year} {scrapedData.manufacturer} {scrapedData.model}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Error Display */}
                        {magicError && (
                            <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
                                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-red-800">{magicError}</p>
                                    <button
                                        onClick={() => setMode('manual')}
                                        className="text-xs text-red-600 underline mt-1"
                                    >
                                        Try manual entry instead
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Feature List */}
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            {[
                                { icon: Search, label: 'FAA Registry Lookup' },
                                { icon: ShieldCheck, label: 'Airworthiness Status' },
                                { icon: FileText, label: 'MEL Generation' },
                                { icon: Sparkles, label: 'AI POH Extraction' },
                            ].map(({ icon: Icon, label }) => (
                                <div key={label} className="flex items-center gap-2 text-zinc-600 bg-zinc-50 px-3 py-2 rounded-lg">
                                    <Icon className="w-3.5 h-3.5 text-indigo-500" />
                                    {label}
                                </div>
                            ))}
                        </div>

                        {/* Add Button */}
                        <Button
                            onClick={handleMagicAdd}
                            disabled={!tailNumber.trim() || isMagicAdding}
                            className="w-full py-4 text-base bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                        >
                            {isMagicAdding ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Scraping Airworthiness Data...
                                </>
                            ) : (
                                <>
                                    <Microscope className="w-5 h-5 mr-2" />
                                    Magic Add Aircraft
                                </>
                            )}
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-zinc-700">Tail Number</label>
                                <div className="flex gap-2 mt-1">
                                    <input required className="w-full px-3 py-2 border border-zinc-300 rounded-lg uppercase focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={formData.tailNumber} onChange={e => setFormData({ ...formData, tailNumber: e.target.value.toUpperCase() })} placeholder="N..." />
                                    <Button type="button" variant="outline" size="icon" onClick={handleLookup} disabled={isLookingUp} title="Auto-fill" className="shrink-0">
                                        {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                    </Button>
                                </div>
                            </div>
                            <div><label className="text-sm font-medium text-zinc-700">Model</label><input required className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg" value={formData.model} onChange={e => setFormData({ ...formData, model: e.target.value })} placeholder="172N" /></div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-sm font-medium text-zinc-700">Manufacturer</label><input required className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg" value={formData.manufacturer} onChange={e => setFormData({ ...formData, manufacturer: e.target.value })} placeholder="Cessna" /></div>
                            <div><label className="text-sm font-medium text-zinc-700">Year</label><input type="number" required className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg" value={formData.year} onChange={e => setFormData({ ...formData, year: parseInt(e.target.value) })} /></div>
                        </div>

                        <div><label className="text-sm font-medium text-zinc-700">Serial Number</label><input required className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg" value={formData.serial} onChange={e => setFormData({ ...formData, serial: e.target.value })} /></div>

                        <div><label className="text-sm font-medium text-zinc-700">Image URL</label><input className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg" value={formData.imageUrl} onChange={e => setFormData({ ...formData, imageUrl: e.target.value })} placeholder="https://..." /></div>

                        <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200 space-y-3">
                            <h3 className="text-sm font-semibold text-zinc-900">Current Times</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs text-zinc-500 uppercase">Hobbs</label><input type="number" step="0.1" required className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-lg" value={formData.currentHours.hobbs} onChange={e => setFormData({ ...formData, currentHours: { ...formData.currentHours, hobbs: parseFloat(e.target.value) } })} /></div>
                                <div><label className="text-xs text-zinc-500 uppercase">Tach</label><input type="number" step="0.1" required className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-lg" value={formData.currentHours.tach} onChange={e => setFormData({ ...formData, currentHours: { ...formData.currentHours, tach: parseFloat(e.target.value) } })} /></div>
                            </div>
                        </div>

                        <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200 space-y-3">
                            <h3 className="text-sm font-semibold text-zinc-900">Maintenance Due Dates</h3>
                            <div className="grid grid-cols-1 gap-3">
                                <div><label className="text-xs text-zinc-500 uppercase">Annual Inspection</label><input type="date" required className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-lg" value={formData.maintenanceDates.annual as string} onChange={e => setFormData({ ...formData, maintenanceDates: { ...formData.maintenanceDates, annual: e.target.value } })} /></div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100">
                            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={isLoading}>{isLoading ? 'Adding...' : 'Add Aircraft'}</Button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
