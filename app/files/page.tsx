'use client';

import { useState, useCallback, useEffect } from 'react';
import { FileText, Upload, Loader2, CheckCircle, AlertTriangle, X, Plane, User, Link2, Unlink, Trash2, Eye, Clock, Sparkles, Search, RefreshCw, FileUp, Brain, Filter, ChevronDown, ChevronUp, FileImage, Calendar, Hash, Star, AlertCircle, Handshake, PenTool } from 'lucide-react';
import { useParsedDocuments, useDeleteParsedDocument, useLinkDocToAircraft, useAircraft, usePilots, useUploadDocument, useStartParsing } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

type DocumentType = 'logbook' | 'maintenance' | 'poh' | 'other';
type FilterType = 'all' | 'logbook' | 'maintenance' | 'pending' | 'completed' | 'failed';

export default function FilesPage() {
  const { data: documents = [], isLoading, refetch } = useParsedDocuments();
  const { data: aircraft = [] } = useAircraft();
  const { data: pilots = [] } = usePilots();
  const deleteDocument = useDeleteParsedDocument();
  const linkDoc = useLinkDocToAircraft();
  const uploadDocument = useUploadDocument();
  const startParsing = useStartParsing();

  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    stage: 'idle' | 'reading' | 'detecting' | 'analyzing' | 'uploading' | 'parsing';
    percent: number;
    message: string;
    filename?: string;
  }>({ stage: 'idle', percent: 0, message: '' });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [showLinkModal, setShowLinkModal] = useState<string | null>(null);
  const [detectedType, setDetectedType] = useState<DocumentType | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

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
  const parsingCount = documents.filter((d: any) => d.status === 'parsing').length;
  useEffect(() => {
    if (parsingCount > 0) {
      const interval = setInterval(() => refetch(), 3000);
      return () => clearInterval(interval);
    }
  }, [parsingCount, refetch]);

  // Detect document type from filename
  const detectDocumentType = useCallback((filename: string): DocumentType => {
    const lower = filename.toLowerCase();
    if (lower.includes('logbook') || lower.includes('flight') || lower.includes('pilot')) {
      return 'logbook';
    }
    if (lower.includes('maintenance') || lower.includes('mx') || lower.includes('annual') || lower.includes('inspection') || lower.includes('aircraft')) {
      return 'maintenance';
    }
    if (lower.includes('poh') || lower.includes('handbook') || lower.includes('manual')) {
      return 'poh';
    }
    return 'maintenance'; // Default to maintenance for aircraft docs
  }, []);

  const handleUpload = useCallback(async (file: File, forcedType?: DocumentType) => {
    setUploadError(null);
    setDetectedType(null);

    // Check file size
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError(`File too large. Maximum size is 50MB. Your file is ${Math.round(file.size / 1024 / 1024)}MB.`);
      return;
    }

    // Stage 1: Reading
    setUploadProgress({ stage: 'reading', percent: 5, message: 'Reading file...', filename: file.name });

    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const readPercent = Math.round((event.loaded / event.total) * 10);
        setUploadProgress({ stage: 'reading', percent: 5 + readPercent, message: 'Reading file...', filename: file.name });
      }
    };
    reader.onerror = () => {
      setUploadError('Failed to read file. Please try again.');
      setUploadProgress({ stage: 'idle', percent: 0, message: '' });
    };
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];

      // Stage 2: Uploading & Analyzing (server-side)
      setUploadProgress({ stage: 'analyzing', percent: 20, message: 'Analyzing document with AI...', filename: file.name });

      uploadDocument.mutate({
        fileBase64: base64,
        fileType: file.type.includes('pdf') ? 'pdf' : 'image',
        documentType: forcedType || 'other', // Server will auto-detect if 'other'
        filename: file.name,
      }, {
        onSuccess: async (data) => {
          // Update detected type from server analysis
          if (data?.documentType) {
            setDetectedType(data.documentType);
          }
          if (data?.analysis) {
            setDetectedType(data.analysis.detectedType || data.documentType);
          }

          // For large files parsed inline
          if (data?.status === 'completed') {
            setUploadProgress({ stage: 'idle', percent: 100, message: 'Complete!', filename: file.name });
            refetch();
            setTimeout(() => {
              setUploadProgress({ stage: 'idle', percent: 0, message: '' });
              setDetectedType(null);
            }, 2000);
            return;
          }

          // Stage 3: Parsing
          setUploadProgress({ stage: 'parsing', percent: 50, message: 'Extracting data from document...', filename: file.name });

          if (data?.documentId) {
            startParsing.mutate(data.documentId, {
              onSuccess: () => {
                setUploadProgress({ stage: 'idle', percent: 100, message: 'Complete!', filename: file.name });
                refetch();
                setTimeout(() => {
                  setUploadProgress({ stage: 'idle', percent: 0, message: '' });
                  setDetectedType(null);
                }, 2000);
              },
              onError: (err: any) => {
                setUploadError(err?.message || 'Failed to parse document.');
                setUploadProgress({ stage: 'idle', percent: 0, message: '' });
                refetch();
              },
            });
          }
        },
        onError: (err: any) => {
          setUploadError(err?.message || 'Upload failed.');
          setUploadProgress({ stage: 'idle', percent: 0, message: '' });
        },
      });
    };
    reader.readAsDataURL(file);
  }, [uploadDocument, startParsing, refetch]);

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

  const handleLink = (docId: string, aircraftId: string | null) => {
    linkDoc.mutate({ docId, aircraftId }, {
      onSuccess: () => {
        refetch();
        setShowLinkModal(null);
      },
    });
  };

  const handleDelete = (docId: string) => {
    if (confirm('Delete this document? This cannot be undone.')) {
      deleteDocument.mutate(docId, {
        onSuccess: () => refetch(),
      });
    }
  };

  // Filter documents
  const filteredDocs = documents.filter((doc: any) => {
    if (filter === 'logbook' && doc.documentType !== 'logbook') return false;
    if (filter === 'maintenance' && doc.documentType !== 'maintenance') return false;
    if (filter === 'pending' && doc.status !== 'pending') return false;
    if (filter === 'completed' && doc.status !== 'completed') return false;
    if (filter === 'failed' && doc.status !== 'failed') return false;
    if (searchQuery && !doc.filename?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success" className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Completed</Badge>;
      case 'parsing':
        return <Badge variant="warning" className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Parsing</Badge>;
      case 'analyzing':
        return <Badge variant="outline" className="flex items-center gap-1 bg-purple-50 text-purple-700 border-purple-200"><Brain className="w-3 h-3 animate-pulse" /> Analyzing</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Failed</Badge>;
      default:
        return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'logbook':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Pilot Logbook</Badge>;
      case 'maintenance':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Maintenance</Badge>;
      case 'poh':
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">POH</Badge>;
      default:
        return <Badge variant="outline">Other</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-3">
              <div className="bg-indigo-100 p-2 rounded-lg">
                <FileText className="w-6 h-6 text-indigo-600" />
              </div>
              Document Intelligence
            </h1>
            <p className="text-zinc-500 mt-1">Upload, parse, and manage all your aviation documents</p>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Upload Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          className={cn(
            "relative border-2 border-dashed rounded-2xl p-8 transition-all bg-white",
            isDragging
              ? "border-indigo-500 bg-indigo-50 scale-[1.01]"
              : uploadProgress.stage !== 'idle'
                ? "border-indigo-300 bg-indigo-50/50"
                : "border-zinc-300 hover:border-indigo-400 hover:bg-indigo-50/30 cursor-pointer"
          )}
        >
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={handleFileInput}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={uploadProgress.stage !== 'idle'}
          />

          {uploadProgress.stage !== 'idle' ? (
            <div className="flex flex-col items-center">
              <div className="relative mb-4">
                <Loader2 className="w-14 h-14 text-indigo-500 animate-spin" />
                {detectedType && (
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow">
                    <Brain className="w-4 h-4 text-indigo-600" />
                  </div>
                )}
              </div>
              <p className="font-semibold text-indigo-700 text-lg">{uploadProgress.message}</p>
              {uploadProgress.filename && (
                <p className="text-sm text-indigo-600 mt-1">{uploadProgress.filename}</p>
              )}
              {detectedType && (
                <div className="mt-2">
                  {getTypeBadge(detectedType)}
                </div>
              )}

              {/* Progress Bar */}
              <div className="w-full max-w-md mt-6">
                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                  <span>
                    {uploadProgress.stage === 'reading' && 'Reading file...'}
                    {uploadProgress.stage === 'analyzing' && 'AI analyzing document...'}
                    {uploadProgress.stage === 'uploading' && 'Saving file...'}
                    {uploadProgress.stage === 'parsing' && 'Extracting data...'}
                  </span>
                  <span>{uploadProgress.percent}%</span>
                </div>
                <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
                <div className="flex justify-between mt-3 text-xs text-zinc-400">
                  <span className={uploadProgress.stage === 'reading' ? 'text-indigo-600 font-medium' : ''}>Read</span>
                  <span className={uploadProgress.stage === 'analyzing' ? 'text-indigo-600 font-medium' : ''}>Analyze</span>
                  <span className={uploadProgress.stage === 'uploading' ? 'text-indigo-600 font-medium' : ''}>Save</span>
                  <span className={uploadProgress.stage === 'parsing' ? 'text-indigo-600 font-medium' : ''}>Extract</span>
                </div>
              </div>
            </div>
          ) : isDragging ? (
            <div className="flex flex-col items-center">
              <FileUp className="w-14 h-14 text-indigo-500 mb-4" />
              <p className="font-semibold text-indigo-700 text-lg">Drop your file here</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="bg-gradient-to-br from-indigo-100 to-purple-100 p-4 rounded-2xl mb-4">
                <Upload className="w-10 h-10 text-indigo-600" />
              </div>
              <p className="font-semibold text-zinc-800 text-lg">Drop files here or click to upload</p>
              <p className="text-sm text-zinc-500 mt-2">PDF or Image • Max 50MB</p>
              <div className="flex gap-2 mt-4">
                <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">
                  <Sparkles className="w-3 h-3 mr-1" /> Auto-detects type
                </Badge>
                <Badge variant="outline" className="bg-purple-50 text-purple-600 border-purple-200">
                  <Brain className="w-3 h-3 mr-1" /> AI-powered parsing
                </Badge>
              </div>
            </div>
          )}
        </div>

        {/* Upload Error */}
        {uploadError && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Upload Failed</p>
              <p className="text-sm text-red-600 mt-1">{uploadError}</p>
            </div>
            <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-zinc-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
            {(['all', 'logbook', 'maintenance', 'completed', 'pending', 'failed'] as FilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                  filter === f
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200"
                )}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'all' && ` (${documents.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Documents Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-zinc-200">
            <FileText className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-500 font-medium">No documents found</p>
            <p className="text-zinc-400 text-sm mt-1">
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
              const hasPreview = doc.filePath || doc.fileBase64;

              return (
                <div
                  key={doc._id}
                  className={cn(
                    "bg-white rounded-xl border transition-all",
                    doc.status === 'parsing' && "border-amber-200 bg-amber-50/30",
                    doc.status === 'analyzing' && "border-purple-200 bg-purple-50/30",
                    doc.status === 'failed' && "border-red-200 bg-red-50/30",
                    doc.status === 'completed' && "border-zinc-200",
                    isExpanded && "shadow-lg"
                  )}
                >
                  {/* Main Card Content */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        {/* Icon/Preview */}
                        <div
                          className={cn(
                            "p-3 rounded-lg flex-shrink-0 cursor-pointer transition-transform hover:scale-105",
                            doc.status === 'parsing' ? "bg-amber-100" :
                            doc.status === 'analyzing' ? "bg-purple-100" :
                            doc.status === 'failed' ? "bg-red-100" :
                            "bg-zinc-100"
                          )}
                          onClick={() => hasPreview && window.open(`/api/files/${doc._id}`, '_blank')}
                          title={hasPreview ? "Click to view file" : undefined}
                        >
                          {doc.status === 'parsing' ? (
                            <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
                          ) : doc.status === 'analyzing' ? (
                            <Brain className="w-6 h-6 text-purple-600 animate-pulse" />
                          ) : doc.status === 'failed' ? (
                            <AlertTriangle className="w-6 h-6 text-red-600" />
                          ) : doc.fileType === 'pdf' ? (
                            <FileText className="w-6 h-6 text-zinc-600" />
                          ) : (
                            <FileImage className="w-6 h-6 text-zinc-600" />
                          )}
                        </div>

                        {/* Document Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-zinc-900 truncate">{doc.filename}</p>
                            {doc.originalFilename && doc.originalFilename !== doc.filename && (
                              <span className="text-xs text-zinc-400" title={`Original: ${doc.originalFilename}`}>
                                (renamed)
                              </span>
                            )}
                          </div>

                          {/* Badges */}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {getTypeBadge(doc.documentType)}
                            {getStatusBadge(doc.status)}
                            {doc.analysis?.confidence && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs",
                                  doc.analysis.confidence >= 0.8 ? "bg-green-50 text-green-700 border-green-200" :
                                  doc.analysis.confidence >= 0.5 ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                                  "bg-red-50 text-red-700 border-red-200"
                                )}
                              >
                                <Star className="w-3 h-3 mr-1" />
                                {Math.round(doc.analysis.confidence * 100)}% confidence
                              </Badge>
                            )}
                            {doc.analysis?.isHandwritten && (
                              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
                                <PenTool className="w-3 h-3 mr-1" /> Handwritten
                              </Badge>
                            )}
                            {doc.analysis?.documentQuality && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs",
                                  doc.analysis.documentQuality === 'excellent' ? "bg-green-50 text-green-700 border-green-200" :
                                  doc.analysis.documentQuality === 'good' ? "bg-blue-50 text-blue-700 border-blue-200" :
                                  doc.analysis.documentQuality === 'fair' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                                  "bg-red-50 text-red-700 border-red-200"
                                )}
                              >
                                {doc.analysis.documentQuality} quality
                              </Badge>
                            )}
                          </div>

                          {/* Summary */}
                          {doc.analysis?.summary && (
                            <p className="text-sm text-zinc-600 mt-2 line-clamp-2">{doc.analysis.summary}</p>
                          )}

                          {/* Stats */}
                          {doc.status === 'completed' && doc.summary && (
                            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-zinc-500">
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
                              {doc.summary.dateRange && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {doc.summary.dateRange.from} - {doc.summary.dateRange.to}
                                </span>
                              )}
                              {doc.fileSize && (
                                <span className="text-zinc-400">
                                  {(doc.fileSize / 1024 / 1024).toFixed(1)} MB
                                </span>
                              )}
                            </div>
                          )}

                          {/* Error */}
                          {doc.status === 'failed' && doc.error && (
                            <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              {doc.error}
                            </p>
                          )}

                          {/* Linked Resources */}
                          {(linkedAircraft || linkedPilot) && (
                            <div className="flex items-center gap-2 mt-2">
                              {linkedAircraft && (
                                <span className="inline-flex items-center gap-1 text-xs bg-zinc-100 text-zinc-600 px-2 py-1 rounded">
                                  <Plane className="w-3 h-3" /> {linkedAircraft.tailNumber}
                                </span>
                              )}
                              {linkedPilot && (
                                <span className="inline-flex items-center gap-1 text-xs bg-zinc-100 text-zinc-600 px-2 py-1 rounded">
                                  <User className="w-3 h-3" /> {linkedPilot.name}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Aircraft from analysis */}
                          {doc.analysis?.aircraftTailNumbers?.length > 0 && !linkedAircraft && (
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs text-zinc-400">Detected aircraft:</span>
                              {doc.analysis.aircraftTailNumbers.slice(0, 3).map((tail: string) => (
                                <span key={tail} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded">
                                  <Plane className="w-3 h-3" /> {tail}
                                </span>
                              ))}
                              {doc.analysis.aircraftTailNumbers.length > 3 && (
                                <span className="text-xs text-zinc-400">+{doc.analysis.aircraftTailNumbers.length - 3} more</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(hasAnalysis || doc.entries?.length > 0) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleExpanded(doc._id)}
                            title={isExpanded ? "Collapse" : "Expand"}
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
                              title="View all entries"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowLinkModal(doc._id)}
                              title="Link to aircraft"
                            >
                              <Link2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {hasPreview && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(`/api/files/${doc._id}`, '_blank')}
                            title="View original file"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                        )}
                        {doc.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startParsing.mutate(doc._id, { onSuccess: () => refetch() })}
                          >
                            <RefreshCw className="w-4 h-4 mr-1" /> Retry
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(doc._id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Analysis Section */}
                  {isExpanded && (
                    <div className="border-t border-zinc-100 p-4 bg-zinc-50/50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Analysis Details */}
                        {hasAnalysis && (
                          <div>
                            <h4 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2">
                              <Brain className="w-4 h-4 text-purple-500" />
                              AI Analysis
                            </h4>
                            <div className="space-y-2 text-sm">
                              {doc.analysis.pilotName && (
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4 text-zinc-400" />
                                  <span className="text-zinc-600">Pilot: </span>
                                  <span className="font-medium">{doc.analysis.pilotName}</span>
                                </div>
                              )}
                              {doc.analysis.dateRange?.from && (
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4 text-zinc-400" />
                                  <span className="text-zinc-600">Date Range: </span>
                                  <span className="font-medium">{doc.analysis.dateRange.from} - {doc.analysis.dateRange.to || 'present'}</span>
                                </div>
                              )}
                              {doc.analysis.estimatedEntryCount > 0 && (
                                <div className="flex items-center gap-2">
                                  <Hash className="w-4 h-4 text-zinc-400" />
                                  <span className="text-zinc-600">Estimated Entries: </span>
                                  <span className="font-medium">{doc.analysis.estimatedEntryCount}</span>
                                </div>
                              )}
                              {doc.analysis.pageCount && (
                                <div className="flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-zinc-400" />
                                  <span className="text-zinc-600">Pages: </span>
                                  <span className="font-medium">{doc.analysis.pageCount}</span>
                                </div>
                              )}
                              {doc.analysis.qualityNotes?.length > 0 && (
                                <div className="mt-3">
                                  <p className="text-zinc-600 mb-1">Quality Notes:</p>
                                  <ul className="list-disc list-inside text-zinc-500 text-xs space-y-1">
                                    {doc.analysis.qualityNotes.map((note: string, idx: number) => (
                                      <li key={idx}>{note}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Preview Entries */}
                        {doc.entries?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-zinc-800 mb-3 flex items-center gap-2">
                              <FileText className="w-4 h-4 text-indigo-500" />
                              Sample Entries ({doc.entries.length} total)
                            </h4>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {doc.entries.slice(0, 5).map((entry: any, idx: number) => (
                                <div key={idx} className="text-xs p-2 bg-white rounded border border-zinc-100">
                                  <div className="flex justify-between">
                                    <span className="font-medium text-zinc-700">{entry.date || 'No date'}</span>
                                    {(entry.totalTime || entry.duration) && (
                                      <span className="text-indigo-600 font-medium">{entry.totalTime || entry.duration} hrs</span>
                                    )}
                                  </div>
                                  {(entry.from || entry.to) && (
                                    <p className="text-zinc-500 mt-0.5">{entry.from} → {entry.to}</p>
                                  )}
                                  {entry.aircraftIdent && (
                                    <p className="text-zinc-400 mt-0.5">{entry.aircraftIdent} {entry.aircraftType && `(${entry.aircraftType})`}</p>
                                  )}
                                  {entry.description && (
                                    <p className="text-zinc-500 mt-0.5 line-clamp-1">{entry.description}</p>
                                  )}
                                </div>
                              ))}
                              {doc.entries.length > 5 && (
                                <button
                                  onClick={() => setSelectedDoc(doc)}
                                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                >
                                  View all {doc.entries.length} entries →
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Link Modal */}
        {showLinkModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-zinc-900">Link to Aircraft</h3>
                <button onClick={() => setShowLinkModal(null)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                <button
                  onClick={() => handleLink(showLinkModal, null)}
                  className="w-full p-3 text-left rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Unlink className="w-5 h-5 text-zinc-400" />
                    <span className="text-zinc-600">Unlink (no aircraft)</span>
                  </div>
                </button>
                {aircraft.map((ac: any) => (
                  <button
                    key={ac._id}
                    onClick={() => handleLink(showLinkModal, ac._id)}
                    className="w-full p-3 text-left rounded-lg border border-zinc-200 hover:bg-indigo-50 hover:border-indigo-200 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Plane className="w-5 h-5 text-indigo-500" />
                      <div>
                        <p className="font-medium text-zinc-900">{ac.tailNumber}</p>
                        <p className="text-sm text-zinc-500">{ac.make} {ac.model}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Document Detail Modal */}
        {selectedDoc && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-6 border-b">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">{selectedDoc.filename}</h3>
                  <div className="flex gap-2 mt-1">
                    {getTypeBadge(selectedDoc.documentType)}
                    {getStatusBadge(selectedDoc.status)}
                  </div>
                </div>
                <button onClick={() => setSelectedDoc(null)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                {selectedDoc.summary && (
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-zinc-50 rounded-lg p-3">
                      <p className="text-xs text-zinc-500 uppercase tracking-wider">Entries</p>
                      <p className="text-2xl font-bold text-zinc-900">{selectedDoc.summary.totalEntries}</p>
                    </div>
                    {selectedDoc.summary.totalHours > 0 && (
                      <div className="bg-zinc-50 rounded-lg p-3">
                        <p className="text-xs text-zinc-500 uppercase tracking-wider">Hours</p>
                        <p className="text-2xl font-bold text-zinc-900">{selectedDoc.summary.totalHours.toFixed(1)}</p>
                      </div>
                    )}
                    {selectedDoc.summary.dateRange && (
                      <div className="bg-zinc-50 rounded-lg p-3">
                        <p className="text-xs text-zinc-500 uppercase tracking-wider">Date Range</p>
                        <p className="text-sm font-medium text-zinc-900">
                          {new Date(selectedDoc.summary.dateRange.from).toLocaleDateString()} - {new Date(selectedDoc.summary.dateRange.to).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {selectedDoc.entries && selectedDoc.entries.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-zinc-900 mb-3">Extracted Entries</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedDoc.entries.slice(0, 20).map((entry: any, idx: number) => (
                        <div key={idx} className="text-sm p-3 bg-zinc-50 rounded-lg">
                          <div className="flex justify-between">
                            <span className="font-medium">{entry.date || 'No date'}</span>
                            {(entry.totalTime || entry.duration) && (
                              <span className="text-zinc-500">{entry.totalTime || entry.duration} hrs</span>
                            )}
                          </div>
                          {entry.description && (
                            <p className="text-zinc-600 mt-1">{entry.description}</p>
                          )}
                          {(entry.from || entry.to) && (
                            <p className="text-zinc-500 mt-1">{entry.from} → {entry.to}</p>
                          )}
                        </div>
                      ))}
                      {selectedDoc.entries.length > 20 && (
                        <p className="text-sm text-zinc-500 text-center py-2">
                          + {selectedDoc.entries.length - 20} more entries
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
