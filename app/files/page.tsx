'use client';

import { useState, useCallback } from 'react';
import { FileText, Upload, Check, X, Loader2, Link2, User, Plane, Clock, AlertCircle, Trash2, Image, FileImage, Eye, ChevronRight } from 'lucide-react';
import { useParsedDocuments, useParseDocument, usePilots, useAircraft, useLinkDocToAircraft, useDeleteParsedDocument } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn, formatShortDate } from '@/lib/utils';
import type { Pilot, Aircraft } from '@/lib/types';

interface QueuedFile {
    id: string;
    file: File;
    status: 'queued' | 'uploading' | 'parsing' | 'completed' | 'failed';
    documentId?: string;
    error?: string;
}

type QueueStatus = QueuedFile['status'];

const STATUS_CONFIG: Record<QueueStatus, { icon: typeof Clock; color: string; label: string }> = {
    queued: { icon: Clock, color: 'text-zinc-400', label: 'Queued' },
    uploading: { icon: Loader2, color: 'text-blue-500 animate-spin', label: 'Uploading...' },
    parsing: { icon: Loader2, color: 'text-purple-500 animate-spin', label: 'Parsing...' },
    completed: { icon: Check, color: 'text-emerald-500', label: 'Completed' },
    failed: { icon: AlertCircle, color: 'text-red-500', label: 'Failed' },
};

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getDocumentType(filename: string): 'logbook' | 'maintenance' {
    const lower = filename.toLowerCase();
    if (lower.includes('maintenance') || lower.includes('mx') || lower.includes('annual')) {
        return 'maintenance';
    }
    return 'logbook';
}

// Analysis steps for user feedback
const ANALYSIS_STEPS = {
    queued: 'Waiting in queue...',
    uploading: 'Uploading file to server...',
    parsing_init: 'Initializing document parser...',
    parsing_ocr: 'Extracting text from document...',
    parsing_ai: 'AI analyzing document content...',
    parsing_extract: 'Extracting logbook entries...',
    parsing_validate: 'Validating extracted data...',
    completed: 'Analysis complete',
    failed: 'Analysis failed',
};

export default function FilesPage() {
    const { data: documents = [], refetch: refetchDocs } = useParsedDocuments();
    const { data: pilots = [] } = usePilots();
    const { data: aircraft = [] } = useAircraft();
    const parseDocument = useParseDocument();
    const deleteDocument = useDeleteParsedDocument();

    const [queue, setQueue] = useState<QueuedFile[]>([]);
    const [dragOver, setDragOver] = useState(false);

    // Create preview URL for file
    const createPreviewUrl = (file: File): string | undefined => {
        if (file.type.startsWith('image/')) {
            return URL.createObjectURL(file);
        }
        return undefined;
    };

    // Process queue automatically
    const processQueue = useCallback(async (files: File[]) => {
        const newItems: QueuedFile[] = files.map(file => ({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
            status: 'queued' as const,
            previewUrl: createPreviewUrl(file),
            analysisStep: ANALYSIS_STEPS.queued,
        }));

        setQueue(prev => [...prev, ...newItems]);

        for (const item of newItems) {
            // Update to uploading status
            setQueue(prev => prev.map(q => q.id === item.id ? {
                ...q,
                status: 'uploading',
                analysisStep: ANALYSIS_STEPS.uploading,
            } : q));

            try {
                const base64 = await fileToBase64(item.file);
                const fileType = item.file.type.includes('pdf') ? 'pdf' : 'image';
                const documentType = getDocumentType(item.file.name);

                // Update to parsing status with step progression
                setQueue(prev => prev.map(q => q.id === item.id ? {
                    ...q,
                    status: 'parsing',
                    analysisStep: ANALYSIS_STEPS.parsing_init,
                } : q));

                // Simulate step progression for better UX
                const updateStep = (step: string) => {
                    setQueue(prev => prev.map(q => q.id === item.id ? { ...q, analysisStep: step } : q));
                };

                // Progress through steps
                setTimeout(() => updateStep(ANALYSIS_STEPS.parsing_ocr), 500);
                setTimeout(() => updateStep(ANALYSIS_STEPS.parsing_ai), 2000);
                setTimeout(() => updateStep(ANALYSIS_STEPS.parsing_extract), 4000);

                await new Promise<void>((resolve, reject) => {
                    parseDocument.mutate({
                        fileBase64: base64,
                        fileType,
                        documentType,
                        filename: item.file.name,
                    }, {
                        onSuccess: (data) => {
                            setQueue(prev => prev.map(q => q.id === item.id ? {
                                ...q,
                                status: 'completed',
                                documentId: data?.data?.documentId,
                                analysisStep: ANALYSIS_STEPS.completed,
                                parsedSummary: {
                                    entries: data?.data?.summary?.totalEntries,
                                    hours: data?.data?.summary?.totalHours,
                                    documentType: documentType,
                                },
                            } : q));
                            refetchDocs();
                            resolve();
                        },
                        onError: (error: Error) => {
                            setQueue(prev => prev.map(q => q.id === item.id ? {
                                ...q,
                                status: 'failed',
                                error: error.message,
                                analysisStep: ANALYSIS_STEPS.failed,
                            } : q));
                            reject(error);
                        },
                    });
                });
            } catch (error) {
                setQueue(prev => prev.map(q => q.id === item.id ? {
                    ...q,
                    status: 'failed',
                    error: (error as Error).message,
                    analysisStep: ANALYSIS_STEPS.failed,
                } : q));
            }
        }
    }, [parseDocument, refetchDocs]);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files).filter(
            f => f.type.includes('pdf') || f.type.includes('image')
        );
        if (files.length > 0) processQueue(files);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) processQueue(files);
    };

    const completedCount = queue.filter(q => q.status === 'completed').length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900">File Manager</h1>
                    <p className="text-sm text-zinc-500">Upload, parse, and organize your documents</p>
                </div>
                <Badge variant="outline">{documents.length} parsed files</Badge>
            </div>

            {/* Upload Zone */}
            <div
                className={cn(
                    "border-2 border-dashed rounded-xl p-8 text-center transition-all bg-white",
                    dragOver ? "border-blue-500 bg-blue-50" : "border-zinc-300 hover:border-zinc-400"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
            >
                <input
                    type="file"
                    accept="image/*,.pdf"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="w-12 h-12 mx-auto text-zinc-400 mb-4" />
                    <p className="text-lg font-medium text-zinc-700">
                        Drop files here or click to upload
                    </p>
                    <p className="text-sm text-zinc-500 mt-1">
                        PDF, PNG, JPG - Logbooks, maintenance records, POH scans
                    </p>
                </label>
            </div>

                {/* Upload Queue with Preview */}
                {queue.length > 0 && (
                    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                        <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
                            <h2 className="font-semibold text-zinc-900 flex items-center gap-2">
                                <Loader2 className="w-4 h-4" />
                                Upload Queue
                            </h2>
                            <span className="text-sm text-zinc-500">
                                {queue.filter(q => q.status === 'completed').length}/{queue.length} complete
                            </span>
                        </div>
                        <div className="divide-y divide-zinc-100">
                            {queue.map(item => (
                                <div key={item.id} className="px-4 py-4 flex items-start gap-4">
                                    {/* File Preview */}
                                    <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                                        {item.previewUrl ? (
                                            <img
                                                src={item.previewUrl}
                                                alt={item.file.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : item.file.type.includes('pdf') ? (
                                            <div className="flex flex-col items-center">
                                                <FileText className="w-6 h-6 text-red-500" />
                                                <span className="text-[8px] text-red-500 font-medium mt-0.5">PDF</span>
                                            </div>
                                        ) : (
                                            <FileImage className="w-6 h-6 text-zinc-400" />
                                        )}
                                    </div>

                                    {/* File Info & Analysis Status */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="font-medium text-zinc-900 truncate">{item.file.name}</p>
                                            <span className="text-xs text-zinc-400">
                                                ({(item.file.size / 1024).toFixed(1)} KB)
                                            </span>
                                        </div>

                                        {/* Analysis Progress */}
                                        <div className="mt-2">
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(item.status)}
                                                <span className={cn(
                                                    "text-sm",
                                                    item.status === 'completed' ? "text-emerald-600" :
                                                    item.status === 'failed' ? "text-red-500" :
                                                    "text-zinc-600"
                                                )}>
                                                    {item.analysisStep || getStatusLabel(item.status)}
                                                </span>
                                            </div>

                                            {/* Progress Bar */}
                                            {(item.status === 'uploading' || item.status === 'parsing') && (
                                                <div className="mt-2 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={cn(
                                                            "h-full rounded-full transition-all duration-500",
                                                            item.status === 'uploading' ? "w-1/4 bg-blue-500" :
                                                            item.analysisStep === ANALYSIS_STEPS.parsing_init ? "w-2/5 bg-purple-500" :
                                                            item.analysisStep === ANALYSIS_STEPS.parsing_ocr ? "w-1/2 bg-purple-500" :
                                                            item.analysisStep === ANALYSIS_STEPS.parsing_ai ? "w-3/4 bg-purple-500" :
                                                            item.analysisStep === ANALYSIS_STEPS.parsing_extract ? "w-[85%] bg-purple-500" :
                                                            "w-[95%] bg-purple-500"
                                                        )}
                                                    />
                                                </div>
                                            )}

                                            {/* Parsed Summary */}
                                            {item.status === 'completed' && item.parsedSummary && (
                                                <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
                                                    {item.parsedSummary.entries !== undefined && (
                                                        <span className="flex items-center gap-1">
                                                            <Check className="w-3 h-3 text-emerald-500" />
                                                            {item.parsedSummary.entries} entries extracted
                                                        </span>
                                                    )}
                                                    {item.parsedSummary.hours !== undefined && (
                                                        <span>{item.parsedSummary.hours} hours</span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Error Message */}
                                            {item.error && (
                                                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" />
                                                    {item.error}
                                                </p>
                                            )}
                                        </div>
            {/* Upload Queue */}
            {queue.length > 0 && (
                <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                    <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
                        <h2 className="font-semibold text-zinc-900 flex items-center gap-2">
                            <Loader2 className="w-4 h-4" />
                            Upload Queue
                        </h2>
                        <span className="text-sm text-zinc-500">
                            {completedCount}/{queue.length} complete
                        </span>
                    </div>
                    <div className="divide-y divide-zinc-100">
                        {queue.map(item => {
                            const config = STATUS_CONFIG[item.status];
                            const Icon = config.icon;
                            return (
                                <div key={item.id} className="px-4 py-3 flex items-center gap-4">
                                    <Icon className={cn("w-4 h-4", config.color)} />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-zinc-900 truncate">{item.file.name}</p>
                                        <p className="text-xs text-zinc-500">{config.label}</p>
                                        {item.error && <p className="text-xs text-red-500">{item.error}</p>}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                        {item.status === 'completed' && (
                                            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                                <Check className="w-3 h-3 mr-1" />
                                                Parsed
                                            </Badge>
                                        )}
                                        <button
                                            onClick={() => removeFromQueue(item.id)}
                                            className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors"
                                        >
                                            <X className="w-4 h-4 text-zinc-400 hover:text-zinc-600" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Parsed Documents */}
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200">
                    <h2 className="font-semibold text-zinc-900 flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Parsed Documents
                    </h2>
                </div>

                {documents.length > 0 ? (
                    <div className="divide-y divide-zinc-100">
                        {documents.map((doc: { _id: string; filename: string; status: string; documentType: string; uploadedAt?: string; createdAt?: string; summary?: { totalEntries?: number; totalHours?: number }; pilot?: string; aircraft?: string }) => (
                            <div key={doc._id} className="px-4 py-4 flex items-center gap-4">
                                <div className={cn(
                                    "w-10 h-10 rounded-lg flex items-center justify-center",
                                    doc.status === 'completed' ? "bg-emerald-100" :
                                    doc.status === 'parsing' ? "bg-purple-100" : "bg-zinc-100"
                                )}>
                                    {doc.status === 'parsing' ? (
                                        <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                                    ) : doc.status === 'completed' ? (
                                        <Check className="w-5 h-5 text-emerald-600" />
                                    ) : (
                                        <FileText className="w-5 h-5 text-zinc-500" />
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-zinc-900 truncate">{doc.filename}</p>
                                        <Badge variant="outline" className="text-xs capitalize">
                                            {doc.documentType}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                                        <span>{formatShortDate(doc.uploadedAt || doc.createdAt || '')}</span>
                                        {doc.summary?.totalEntries && (
                                            <span>{doc.summary.totalEntries} entries</span>
                                        )}
                                        {doc.summary?.totalHours && (
                                            <span>{doc.summary.totalHours} hrs</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {doc.pilot ? (
                                        <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                                            <User className="w-3 h-3 mr-1" />
                                            {pilots.find((p: Pilot) => p._id === doc.pilot)?.name || 'Pilot'}
                                        </Badge>
                                    ) : doc.aircraft ? (
                                        <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">
                                            <Plane className="w-3 h-3 mr-1" />
                                            {aircraft.find((a: Aircraft) => a._id === doc.aircraft)?.tailNumber || 'Aircraft'}
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-zinc-500">
                                            <Link2 className="w-3 h-3 mr-1" />
                                            Unlinked
                                        </Badge>
                                    )}
                                </div>

                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                    onClick={() => deleteDocument.mutate(doc._id, { onSuccess: () => refetchDocs() })}
                                >
                                    <Trash2 className="w-4 h-4 text-zinc-400 hover:text-red-500" />
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <EmptyState
                        icon={FileText}
                        title="No parsed documents yet"
                        description="Upload files above to get started"
                        className="py-12"
                    />
                )}
            </div>
        </div>
    );
}
