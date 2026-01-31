'use client';

import { useState, useCallback, useEffect } from 'react';
import { FileText, Upload, Loader2, CheckCircle, AlertTriangle, X, Plane, User, Link2, Unlink, Trash2, Eye, Clock, Sparkles, Search, RefreshCw, FileUp, Brain, Filter } from 'lucide-react';
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
    stage: 'idle' | 'reading' | 'detecting' | 'uploading' | 'parsing';
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
    setUploadProgress({ stage: 'reading', percent: 10, message: 'Reading file...', filename: file.name });

    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const readPercent = Math.round((event.loaded / event.total) * 15);
        setUploadProgress({ stage: 'reading', percent: 10 + readPercent, message: 'Reading file...', filename: file.name });
      }
    };
    reader.onerror = () => {
      setUploadError('Failed to read file. Please try again.');
      setUploadProgress({ stage: 'idle', percent: 0, message: '' });
    };
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];

      // Stage 2: Detecting type
      setUploadProgress({ stage: 'detecting', percent: 30, message: 'Detecting document type...', filename: file.name });
      const docType = forcedType || detectDocumentType(file.name);
      setDetectedType(docType);
      await new Promise(r => setTimeout(r, 400));

      // Stage 3: Uploading
      setUploadProgress({ stage: 'uploading', percent: 40, message: `Uploading ${docType} document...`, filename: file.name });

      uploadDocument.mutate({
        fileBase64: base64,
        fileType: file.type.includes('pdf') ? 'pdf' : 'image',
        documentType: docType,
        filename: file.name,
      }, {
        onSuccess: async (data) => {
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

          // Stage 4: Parsing
          setUploadProgress({ stage: 'parsing', percent: 55, message: 'AI is analyzing document...', filename: file.name });

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
  }, [detectDocumentType, uploadDocument, startParsing, refetch]);

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
                    {uploadProgress.stage === 'reading' && 'Reading'}
                    {uploadProgress.stage === 'detecting' && 'Detecting'}
                    {uploadProgress.stage === 'uploading' && 'Uploading'}
                    {uploadProgress.stage === 'parsing' && 'AI Parsing'}
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
                  <span className={uploadProgress.stage === 'detecting' ? 'text-indigo-600 font-medium' : ''}>Detect</span>
                  <span className={uploadProgress.stage === 'uploading' ? 'text-indigo-600 font-medium' : ''}>Upload</span>
                  <span className={uploadProgress.stage === 'parsing' ? 'text-indigo-600 font-medium' : ''}>Parse</span>
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

              return (
                <div
                  key={doc._id}
                  className={cn(
                    "bg-white rounded-xl border p-4 transition-all hover:shadow-md",
                    doc.status === 'parsing' && "border-amber-200 bg-amber-50/30",
                    doc.status === 'failed' && "border-red-200 bg-red-50/30",
                    doc.status === 'completed' && "border-zinc-200"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className={cn(
                        "p-3 rounded-lg flex-shrink-0",
                        doc.status === 'parsing' ? "bg-amber-100" :
                        doc.status === 'failed' ? "bg-red-100" :
                        "bg-zinc-100"
                      )}>
                        {doc.status === 'parsing' ? (
                          <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
                        ) : doc.status === 'failed' ? (
                          <AlertTriangle className="w-6 h-6 text-red-600" />
                        ) : (
                          <FileText className="w-6 h-6 text-zinc-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-zinc-900 truncate">{doc.filename}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {getTypeBadge(doc.documentType)}
                          {getStatusBadge(doc.status)}
                        </div>
                        {doc.status === 'completed' && doc.summary && (
                          <p className="text-sm text-zinc-500 mt-2">
                            {doc.summary.totalEntries} entries
                            {doc.summary.totalHours > 0 && ` • ${doc.summary.totalHours.toFixed(1)} hours`}
                          </p>
                        )}
                        {doc.status === 'failed' && doc.error && (
                          <p className="text-sm text-red-600 mt-2">{doc.error}</p>
                        )}
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
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {doc.status === 'completed' && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedDoc(doc)}
                            title="View details"
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
