'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  Loader2,
  CheckCircle,
  AlertTriangle,
  X,
  Plane,
  Trash2,
  RefreshCw,
  Search,
  Clock,
  Calendar,
  Hash,
  User,
  Star,
  PenTool,
  FileImage,
  ChevronDown,
  ChevronUp,
  Eye,
  Link2,
  AlertCircle,
  Sparkles,
  Brain,
  FileUp,
  Zap,
  Server,
  Database,
  Cpu,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Terminal,
  Shield,
  FileCheck,
  Scale,
  BadgeCheck,
  GraduationCap,
  ClipboardCheck,
  Wrench,
  ScrollText,
  FileBadge,
  HeartPulse,
  Award,
  BookOpen,
  FileWarning
} from 'lucide-react';
import { useParsedDocuments, useDeleteParsedDocument, useLinkDocToAircraft, useLinkDocToPilot, useAircraft, usePilots, useStartParsing } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { MagicImport } from '@/components/MagicImport';
import { DocumentType, DOCUMENT_TYPE_META } from '@/lib/documentTypes';

// Category filter type
type CategoryFilter = 'all' | 'pilot' | 'aircraft' | 'general';

interface ProcessingLog {
  id: string;
  step: string;
  message: string;
  timestamp: Date;
  progress: number;
  duration?: number;
  details?: Record<string, any>;
  status: 'pending' | 'active' | 'complete' | 'error';
}

// Step icons mapping
const stepIcons: Record<string, any> = {
  initializing: Server,
  validating: CheckCircle2,
  preparing: FileText,
  uploading: Upload,
  analyzing: Brain,
  classifying: Sparkles,
  extracting: Cpu,
  parsing: Zap,
  structuring: Database,
  validating_output: CheckCircle2,
  complete: CheckCircle,
  error: XCircle
};

// Step colors
const stepColors: Record<string, string> = {
  initializing: 'text-slate-500',
  validating: 'text-blue-500',
  preparing: 'text-indigo-500',
  uploading: 'text-cyan-500',
  analyzing: 'text-purple-500',
  classifying: 'text-violet-500',
  extracting: 'text-amber-500',
  parsing: 'text-orange-500',
  structuring: 'text-emerald-500',
  validating_output: 'text-teal-500',
  complete: 'text-green-500',
  error: 'text-red-500'
};

// Icon mapping for document types
const typeIcons: Record<string, any> = {
  pilot_logbook: BookOpen,
  aircraft_logbook: ScrollText,
  maintenance: Wrench,
  inspection: FileCheck,
  poh: FileText,
  weight_balance: Scale,
  insurance: Shield,
  registration: FileBadge,
  medical: HeartPulse,
  certificate: Award,
  endorsement: GraduationCap,
  checkout: ClipboardCheck,
  ad_compliance: FileWarning,
  service_bulletin: BadgeCheck,
  logbook: BookOpen,
  other: FileText
};

export default function FilesPage() {
  const { data: documents = [], isLoading, refetch } = useParsedDocuments();
  const { data: aircraft = [] } = useAircraft();
  const { data: pilots = [] } = usePilots();
  const deleteDocument = useDeleteParsedDocument();
  const linkDocToAircraft = useLinkDocToAircraft();
  const linkDocToPilot = useLinkDocToPilot();
  const startParsing = useStartParsing();

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingLogs, setProcessingLogs] = useState<ProcessingLog[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLinkModal, setShowLinkModal] = useState<{ docId: string; mode: 'aircraft' | 'pilot' } | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [processingLogs]);

  // Toggle document expansion
  const toggleExpanded = (docId: string) => {
    setExpandedDocs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(docId)) {
        newSet.delete(docId);
      } else {
        newSet.add(docId);
      }
      return newSet;
    });
  };

  // Auto-refresh when documents are being parsed
  const parsingCount = documents.filter((d: any) => d.status === 'parsing' || d.status === 'analyzing').length;
  useEffect(() => {
    if (parsingCount > 0) {
      const interval = setInterval(() => refetch(), 3000);
      return () => clearInterval(interval);
    }
  }, [parsingCount, refetch]);

  // Add a log entry
  const addLog = useCallback((log: Omit<ProcessingLog, 'id'>) => {
    setProcessingLogs(prev => {
      const existing = prev.find(l => l.step === log.step && l.status === 'active');
      if (existing) {
        return prev.map(l =>
          l.id === existing.id
            ? { ...l, ...log, id: existing.id }
            : l
        );
      }
      return [...prev, { ...log, id: `${Date.now()}-${Math.random()}` }];
    });
  }, []);

  // Handle file upload with SSE streaming
  const handleUpload = useCallback(async (file: File) => {
    setUploadError(null);
    setUploadResult(null);
    setProcessingLogs([]);
    setIsUploading(true);
    setUploadProgress(0);

    if (file.size > 50 * 1024 * 1024) {
      setUploadError('File too large. Maximum size is 50MB.');
      setIsUploading(false);
      return;
    }

    addLog({
      step: 'initializing',
      message: 'Starting file upload...',
      timestamp: new Date(),
      progress: 0,
      status: 'active'
    });

    try {
      // Read file as base64
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      addLog({
        step: 'preparing',
        message: `File read: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
        timestamp: new Date(),
        progress: 5,
        status: 'complete',
        details: { filename: file.name, size: file.size }
      });

      // Start SSE connection
      const response = await fetch('/api/documents/upload-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64,
          fileType: file.type.includes('pdf') ? 'pdf' : 'image',
          documentType: 'other',
          filename: file.name,
        }),
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        let currentData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);
            try {
              const data = JSON.parse(currentData);

              if (currentEvent === 'log') {
                setUploadProgress(data.progress);
                addLog({
                  step: data.step,
                  message: data.message,
                  timestamp: new Date(data.timestamp),
                  progress: data.progress,
                  duration: data.duration,
                  details: data.details,
                  status: data.step === 'error' ? 'error' : data.step === 'complete' ? 'complete' : 'active'
                });
              } else if (currentEvent === 'complete') {
                setUploadProgress(100);
                setUploadResult(data);
                addLog({
                  step: 'complete',
                  message: 'Processing complete!',
                  timestamp: new Date(),
                  progress: 100,
                  status: 'complete',
                  details: data
                });
                refetch();
              } else if (currentEvent === 'error') {
                setUploadError(data.message);
                addLog({
                  step: 'error',
                  message: data.message,
                  timestamp: new Date(),
                  progress: 0,
                  status: 'error'
                });
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

    } catch (error) {
      setUploadError((error as Error).message);
      addLog({
        step: 'error',
        message: `Upload failed: ${(error as Error).message}`,
        timestamp: new Date(),
        progress: 0,
        status: 'error'
      });
    } finally {
      setIsUploading(false);
    }
  }, [addLog, refetch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.includes('pdf') || file.type.includes('image'))) {
      handleUpload(file);
    }
  }, [handleUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  }, [handleUpload]);

  const handleDelete = (docId: string) => {
    if (confirm('Delete this document?')) {
      deleteDocument.mutate(docId, { onSuccess: () => refetch() });
    }
  };

  const clearUploadState = () => {
    setProcessingLogs([]);
    setUploadError(null);
    setUploadResult(null);
    setUploadProgress(0);
  };

  const filteredDocs = documents.filter((doc: any) => {
    if (searchQuery && !doc.filename?.toLowerCase().includes(searchQuery.toLowerCase())) return false;

    // Category filter
    if (categoryFilter !== 'all') {
      const meta = DOCUMENT_TYPE_META[doc.documentType as DocumentType];
      if (meta && meta.category !== categoryFilter) return false;
    }

    // Type filter
    if (typeFilter !== 'all' && doc.documentType !== typeFilter) return false;
    return true;
  });

  // Get unique document types for filter dropdown
  const availableTypes = Array.from(new Set(documents.map((d: any) => d.documentType))).filter(Boolean);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success" className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Completed</Badge>;
      case 'parsing':
        return <Badge variant="warning" className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Parsing</Badge>;
      case 'analyzing':
        return <Badge variant="outline" className="flex items-center gap-1 bg-purple-50 text-purple-700 border-purple-200"><Loader2 className="w-3 h-3 animate-pulse" /> Analyzing</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Failed</Badge>;
      default:
        return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const meta = DOCUMENT_TYPE_META[type as DocumentType];
    const Icon = typeIcons[type] || FileText;

    const colorClasses: Record<string, string> = {
      pilot_logbook: 'bg-blue-50 text-blue-700 border-blue-200',
      aircraft_logbook: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      maintenance: 'bg-amber-50 text-amber-700 border-amber-200',
      inspection: 'bg-orange-50 text-orange-700 border-orange-200',
      poh: 'bg-purple-50 text-purple-700 border-purple-200',
      weight_balance: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      insurance: 'bg-slate-50 text-slate-700 border-slate-200',
      registration: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      medical: 'bg-rose-50 text-rose-700 border-rose-200',
      certificate: 'bg-violet-50 text-violet-700 border-violet-200',
      endorsement: 'bg-teal-50 text-teal-700 border-teal-200',
      checkout: 'bg-lime-50 text-lime-700 border-lime-200',
      ad_compliance: 'bg-red-50 text-red-700 border-red-200',
      service_bulletin: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      logbook: 'bg-blue-50 text-blue-700 border-blue-200',
      other: 'bg-gray-50 text-gray-700 border-gray-200'
    };

    const colorClass = colorClasses[type] || colorClasses.other;
    const label = meta?.label || type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');

    return (
      <Badge variant="outline" className={cn("gap-1", colorClass)}>
        <Icon className="w-3 h-3" />
        {label}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-zinc-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
                <FileText className="w-6 h-6 text-white" />
              </div>
              Document Intelligence
            </h1>
            <p className="text-slate-500 mt-1">AI-powered aviation document processing with real-time progress</p>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2">
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Magic Onboarding Zone */}
        <MagicImport />

        {/* Upload Zone with Live Processing Log */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upload Area */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            className={cn(
              "relative border-2 border-dashed rounded-2xl p-8 transition-all bg-white shadow-sm",
              isDragging
                ? "border-indigo-500 bg-indigo-50 scale-[1.02] shadow-lg shadow-indigo-100"
                : isUploading
                  ? "border-indigo-300 bg-gradient-to-br from-indigo-50 to-purple-50"
                  : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50/50 cursor-pointer"
            )}
          >
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isUploading}
            />

            {isUploading ? (
              <div className="flex flex-col items-center">
                <div className="relative mb-4">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                    <Cpu className="w-10 h-10 text-indigo-600 animate-pulse" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1.5 shadow-lg">
                    <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                  </div>
                </div>
                <p className="font-semibold text-slate-800 text-lg">Processing Document</p>
                <p className="text-sm text-slate-500 mt-1">AI is analyzing your file...</p>

                {/* Progress Bar */}
                <div className="w-full max-w-xs mt-6">
                  <div className="flex justify-between text-xs text-slate-500 mb-2">
                    <span>Progress</span>
                    <span className="font-mono">{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : isDragging ? (
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-4">
                  <FileUp className="w-10 h-10 text-indigo-600" />
                </div>
                <p className="font-semibold text-indigo-700 text-lg">Drop your file here</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center mb-4">
                  <Upload className="w-10 h-10 text-slate-400" />
                </div>
                <p className="font-semibold text-slate-800 text-lg">Drop files here or click to upload</p>
                <p className="text-sm text-slate-500 mt-2">PDF or Image up to 50MB</p>
                <div className="flex gap-2 mt-4">
                  <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 gap-1">
                    <Sparkles className="w-3 h-3" /> Auto-detects type
                  </Badge>
                  <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200 gap-1">
                    <Brain className="w-3 h-3" /> Reducto AI powered
                  </Badge>
                </div>
              </div>
            )}
          </div>

          {/* Live Processing Log */}
          <div className="bg-slate-900 rounded-2xl p-4 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-green-400" />
                <span className="text-sm font-mono text-slate-300">Processing Log</span>
              </div>
              {processingLogs.length > 0 && (
                <button
                  onClick={clearUploadState}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            <div
              ref={logContainerRef}
              className="h-64 overflow-y-auto font-mono text-xs space-y-1 pr-2"
            >
              {processingLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <Terminal className="w-8 h-8 mb-2 opacity-50" />
                  <p>Upload a file to see processing logs</p>
                </div>
              ) : (
                processingLogs.map((log, idx) => {
                  const Icon = stepIcons[log.step] || Zap;
                  const color = stepColors[log.step] || 'text-slate-400';
                  const isLatest = idx === processingLogs.length - 1;

                  return (
                    <div
                      key={log.id}
                      className={cn(
                        "flex items-start gap-2 py-1 px-2 rounded transition-all",
                        log.status === 'error' && "bg-red-500/10",
                        log.status === 'complete' && log.step === 'complete' && "bg-green-500/10",
                        isLatest && log.status === 'active' && "bg-slate-800"
                      )}
                    >
                      <Icon className={cn("w-3.5 h-3.5 mt-0.5 flex-shrink-0", color, log.status === 'active' && "animate-pulse")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className={cn("font-medium", color)}>[{log.step}]</span>
                          <span className="text-slate-300 truncate">{log.message}</span>
                        </div>
                      </div>
                      <span className="text-slate-600 text-[10px] flex-shrink-0">
                        {log.duration ? `${(log.duration / 1000).toFixed(1)}s` : ''}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Result Summary */}
            {uploadResult && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  <span className="font-medium">Processing Complete</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-800 rounded px-2 py-1">
                    <span className="text-slate-500">Type:</span>{' '}
                    <span className="text-indigo-400">{uploadResult.documentType}</span>
                  </div>
                  <div className="bg-slate-800 rounded px-2 py-1">
                    <span className="text-slate-500">Entries:</span>{' '}
                    <span className="text-emerald-400">{uploadResult.entryCount || uploadResult.summary?.totalEntries || 0}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error Display */}
            {uploadError && (
              <div className="mt-3 pt-3 border-t border-slate-700">
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <XCircle className="w-4 h-4" />
                  <span className="font-medium">Error</span>
                </div>
                <p className="text-red-300 text-xs mt-1">{uploadError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
            </div>

            {/* Category filter buttons */}
            <div className="flex gap-1 border-l border-slate-200 pl-4">
              {[
                { key: 'all', label: 'All', icon: FileText },
                { key: 'pilot', label: 'Pilot', icon: User },
                { key: 'aircraft', label: 'Aircraft', icon: Plane }
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { setCategoryFilter(key as CategoryFilter); setTypeFilter('all'); }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5",
                    categoryFilter === key
                      ? "bg-indigo-100 text-indigo-700"
                      : "text-slate-500 hover:bg-slate-100"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Document type filter chips */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTypeFilter('all')}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                typeFilter === 'all'
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              All Types
            </button>
            {availableTypes.map((type: string) => {
              const meta = DOCUMENT_TYPE_META[type as DocumentType];
              if (categoryFilter !== 'all' && meta?.category !== categoryFilter) return null;

              const TypeIcon = typeIcons[type] || FileText;
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1",
                    typeFilter === type
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  <TypeIcon className="w-3 h-3" />
                  {meta?.label || type}
                </button>
              );
            })}
          </div>
        </div>

        {/* Documents Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-slate-100 shadow-sm">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">No documents found</p>
            <p className="text-slate-400 text-sm mt-1">
              {documents.length === 0 ? 'Upload your first document above' : 'Try adjusting your filters'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredDocs.map((doc: any) => {
              const linkedAircraft = aircraft.find((a: any) => a._id === doc.aircraft);
              const linkedPilot = pilots.find((p: any) => p._id === doc.pilot);
              const isExpanded = expandedDocs.has(doc._id);
              const hasAnalysis = doc.analysis && Object.keys(doc.analysis).length > 0;

              return (
                <div
                  key={doc._id}
                  className={cn(
                    "bg-white rounded-xl border transition-all shadow-sm hover:shadow-md",
                    doc.status === 'parsing' && "border-amber-200 bg-amber-50/30",
                    doc.status === 'analyzing' && "border-purple-200 bg-purple-50/30",
                    doc.status === 'failed' && "border-red-200 bg-red-50/30",
                    doc.status === 'completed' && "border-slate-100",
                    isExpanded && "shadow-lg"
                  )}
                >
                  {/* Main Card Content */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        {/* Icon */}
                        <div
                          className={cn(
                            "p-3 rounded-xl flex-shrink-0 transition-transform hover:scale-105",
                            doc.status === 'parsing' ? "bg-gradient-to-br from-amber-100 to-orange-100" :
                              doc.status === 'analyzing' ? "bg-gradient-to-br from-purple-100 to-violet-100" :
                                doc.status === 'failed' ? "bg-gradient-to-br from-red-100 to-rose-100" :
                                  "bg-gradient-to-br from-slate-100 to-slate-50"
                          )}
                        >
                          {doc.status === 'parsing' ? (
                            <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
                          ) : doc.status === 'analyzing' ? (
                            <Brain className="w-6 h-6 text-purple-600 animate-pulse" />
                          ) : doc.status === 'failed' ? (
                            <AlertTriangle className="w-6 h-6 text-red-600" />
                          ) : doc.fileType === 'pdf' ? (
                            <FileText className="w-6 h-6 text-slate-600" />
                          ) : (
                            <FileImage className="w-6 h-6 text-slate-600" />
                          )}
                        </div>

                        {/* Document Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{doc.filename}</p>

                          {/* Badges */}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {getTypeBadge(doc.documentType)}
                            {getStatusBadge(doc.status)}
                            {doc.analysis?.confidence && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs gap-1",
                                  doc.analysis.confidence >= 0.8 ? "bg-green-50 text-green-700 border-green-200" :
                                    doc.analysis.confidence >= 0.5 ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                                      "bg-red-50 text-red-700 border-red-200"
                                )}
                              >
                                <Star className="w-3 h-3" />
                                {Math.round(doc.analysis.confidence * 100)}%
                              </Badge>
                            )}
                            {doc.analysis?.isHandwritten && (
                              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs gap-1">
                                <PenTool className="w-3 h-3" /> Handwritten
                              </Badge>
                            )}
                          </div>

                          {/* Stats */}
                          {doc.status === 'completed' && doc.summary && (
                            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-500">
                              <span className="flex items-center gap-1">
                                <Hash className="w-3 h-3" />
                                {doc.summary.totalEntries} entries
                              </span>
                              {doc.summary.totalHours > 0 && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {doc.summary.totalHours.toFixed(1)} hours
                                </span>
                              )}
                            </div>
                          )}

                          {/* Linked Resources */}
                          {(linkedAircraft || linkedPilot) && (
                            <div className="flex items-center gap-2 mt-2">
                              {linkedAircraft && (
                                <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg">
                                  <Plane className="w-3 h-3" /> {linkedAircraft.tailNumber}
                                </span>
                              )}
                              {linkedPilot && (
                                <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-600 px-2 py-1 rounded-lg">
                                  <User className="w-3 h-3" /> {linkedPilot.name}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {(hasAnalysis || doc.entries?.length > 0) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleExpanded(doc._id)}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        )}
                        {doc.status === 'completed' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedDoc(doc)}
                              className="text-slate-400 hover:text-indigo-600"
                              title="View entries"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowLinkModal({ docId: doc._id, mode: 'pilot' })}
                              className="text-slate-400 hover:text-blue-600"
                              title="Link to pilot"
                            >
                              <User className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowLinkModal({ docId: doc._id, mode: 'aircraft' })}
                              className="text-slate-400 hover:text-indigo-600"
                              title="Link to aircraft"
                            >
                              <Plane className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {doc.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startParsing.mutate(doc._id, { onSuccess: () => refetch() })}
                            className="text-amber-600 border-amber-200 hover:bg-amber-50"
                          >
                            <RefreshCw className="w-4 h-4 mr-1" /> Retry
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(doc._id)}
                          className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded Section */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 p-4 bg-slate-50/50 mt-4 -mx-4 -mb-4 rounded-b-xl">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Analysis Details */}
                          {hasAnalysis && (
                            <div>
                              <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                <Brain className="w-4 h-4 text-purple-500" />
                                AI Analysis
                              </h4>
                              <div className="space-y-2 text-sm">
                                {doc.analysis.pilotName && (
                                  <div className="flex items-center gap-2">
                                    <User className="w-4 h-4 text-slate-400" />
                                    <span className="text-slate-600">Pilot:</span>
                                    <span className="font-medium text-slate-800">{doc.analysis.pilotName}</span>
                                  </div>
                                )}
                                {doc.analysis.dateRange?.from && (
                                  <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-slate-400" />
                                    <span className="text-slate-600">Period:</span>
                                    <span className="font-medium text-slate-800">
                                      {doc.analysis.dateRange.from} - {doc.analysis.dateRange.to || 'present'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Preview Entries */}
                          {doc.entries?.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-indigo-500" />
                                Sample Entries ({doc.entries.length} total)
                              </h4>
                              <div className="space-y-2 max-h-48 overflow-y-auto">
                                {doc.entries.slice(0, 5).map((entry: any, idx: number) => (
                                  <div key={idx} className="text-xs p-2.5 bg-white rounded-lg border border-slate-100">
                                    <div className="flex justify-between">
                                      <span className="font-medium text-slate-700">{entry.date || 'No date'}</span>
                                      {(entry.totalTime || entry.duration) && (
                                        <span className="text-indigo-600 font-semibold">{entry.totalTime || entry.duration} hrs</span>
                                      )}
                                    </div>
                                    {(entry.from || entry.to) && (
                                      <p className="text-slate-500 mt-0.5">{entry.from} → {entry.to}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Link Modal */}
        {showLinkModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                {showLinkModal.mode === 'pilot' ? (
                  <>
                    <User className="w-5 h-5 text-blue-600" />
                    Link to Pilot
                  </>
                ) : (
                  <>
                    <Plane className="w-5 h-5 text-indigo-600" />
                    Link to Aircraft
                  </>
                )}
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {/* Unlink option */}
                <button
                  onClick={() => {
                    if (showLinkModal.mode === 'pilot') {
                      linkDocToPilot.mutate({ docId: showLinkModal.docId, pilotId: null }, {
                        onSuccess: () => { refetch(); setShowLinkModal(null); }
                      });
                    } else {
                      linkDocToAircraft.mutate({ docId: showLinkModal.docId, aircraftId: null }, {
                        onSuccess: () => { refetch(); setShowLinkModal(null); }
                      });
                    }
                  }}
                  className="w-full p-3 text-left rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <span className="text-slate-500">Unlink</span>
                </button>

                {/* Pilot list */}
                {showLinkModal.mode === 'pilot' && pilots.map((pilot: any) => (
                  <button
                    key={pilot._id}
                    onClick={() => {
                      linkDocToPilot.mutate({ docId: showLinkModal.docId, pilotId: pilot._id }, {
                        onSuccess: () => { refetch(); setShowLinkModal(null); }
                      });
                    }}
                    className="w-full p-3 text-left rounded-xl border border-slate-200 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-100">
                        <User className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{pilot.name}</p>
                        <p className="text-sm text-slate-500">{pilot.email}</p>
                      </div>
                    </div>
                  </button>
                ))}

                {/* Aircraft list */}
                {showLinkModal.mode === 'aircraft' && aircraft.map((ac: any) => (
                  <button
                    key={ac._id}
                    onClick={() => {
                      linkDocToAircraft.mutate({ docId: showLinkModal.docId, aircraftId: ac._id }, {
                        onSuccess: () => { refetch(); setShowLinkModal(null); }
                      });
                    }}
                    className="w-full p-3 text-left rounded-xl border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-indigo-100">
                        <Plane className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{ac.tailNumber}</p>
                        <p className="text-sm text-slate-500">{ac.model}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <Button variant="outline" onClick={() => setShowLinkModal(null)} className="w-full">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Document Detail Modal */}
        {selectedDoc && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{selectedDoc.filename}</h3>
                  <p className="text-sm text-slate-500">{selectedDoc.entries?.length || 0} entries</p>
                </div>
                <Button variant="ghost" onClick={() => setSelectedDoc(null)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                <div className="space-y-2">
                  {selectedDoc.entries?.map((entry: any, idx: number) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-medium text-slate-800">{entry.date || 'No date'}</span>
                          {entry.aircraftIdent && (
                            <span className="ml-2 text-indigo-600">{entry.aircraftIdent}</span>
                          )}
                        </div>
                        {(entry.totalTime || entry.duration) && (
                          <span className="text-emerald-600 font-semibold">{entry.totalTime || entry.duration} hrs</span>
                        )}
                      </div>
                      {(entry.from || entry.to) && (
                        <p className="text-sm text-slate-600 mt-1">{entry.from} → {entry.to}</p>
                      )}
                      {entry.remarks && (
                        <p className="text-xs text-slate-500 mt-1">{entry.remarks}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
