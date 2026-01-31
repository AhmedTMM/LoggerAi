'use client';

import { useState, useCallback, useEffect } from 'react';
import { FileText, Upload, Loader2, CheckCircle, AlertTriangle, X, Plane, Trash2, RefreshCw, Search } from 'lucide-react';
import { useParsedDocuments, useDeleteParsedDocument, useLinkDocToAircraft, useAircraft, useUploadDocument, useStartParsing } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

type DocumentType = 'logbook' | 'maintenance' | 'poh' | 'other';

export default function FilesPage() {
  const { data: documents = [], isLoading, refetch } = useParsedDocuments();
  const { data: aircraft = [] } = useAircraft();
  const deleteDocument = useDeleteParsedDocument();
  const linkDoc = useLinkDocToAircraft();
  const uploadDocument = useUploadDocument();
  const startParsing = useStartParsing();

  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    stage: 'idle' | 'uploading' | 'parsing';
    message: string;
  }>({ stage: 'idle', message: '' });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLinkModal, setShowLinkModal] = useState<string | null>(null);

  // Auto-refresh when documents are being parsed
  const parsingCount = documents.filter((d: any) => d.status === 'parsing').length;
  useEffect(() => {
    if (parsingCount > 0) {
      const interval = setInterval(() => refetch(), 3000);
      return () => clearInterval(interval);
    }
  }, [parsingCount, refetch]);

  const detectDocumentType = useCallback((filename: string): DocumentType => {
    const lower = filename.toLowerCase();
    if (lower.includes('logbook') || lower.includes('flight') || lower.includes('pilot')) {
      return 'logbook';
    }
    if (lower.includes('maintenance') || lower.includes('mx') || lower.includes('annual')) {
      return 'maintenance';
    }
    if (lower.includes('poh') || lower.includes('handbook')) {
      return 'poh';
    }
    return 'maintenance';
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    setUploadError(null);

    if (file.size > 50 * 1024 * 1024) {
      setUploadError('File too large. Maximum size is 50MB.');
      return;
    }

    setUploadProgress({ stage: 'uploading', message: 'Uploading...' });

    const reader = new FileReader();
    reader.onerror = () => {
      setUploadError('Failed to read file.');
      setUploadProgress({ stage: 'idle', message: '' });
    };
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      const docType = detectDocumentType(file.name);

      uploadDocument.mutate({
        fileBase64: base64,
        fileType: file.type.includes('pdf') ? 'pdf' : 'image',
        documentType: docType,
        filename: file.name,
      }, {
        onSuccess: async (data) => {
          if (data?.status === 'completed') {
            setUploadProgress({ stage: 'idle', message: '' });
            refetch();
            return;
          }

          setUploadProgress({ stage: 'parsing', message: 'Processing...' });

          if (data?.documentId) {
            startParsing.mutate(data.documentId, {
              onSuccess: () => {
                setUploadProgress({ stage: 'idle', message: '' });
                refetch();
              },
              onError: () => {
                setUploadError('Failed to parse document.');
                setUploadProgress({ stage: 'idle', message: '' });
                refetch();
              },
            });
          }
        },
        onError: () => {
          setUploadError('Upload failed.');
          setUploadProgress({ stage: 'idle', message: '' });
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

  const handleDelete = (docId: string) => {
    if (confirm('Delete this document?')) {
      deleteDocument.mutate(docId, { onSuccess: () => refetch() });
    }
  };

  const filteredDocs = documents.filter((doc: any) => {
    if (searchQuery && !doc.filename?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge variant="success">Completed</Badge>;
      case 'parsing': return <Badge variant="warning">Processing</Badge>;
      case 'failed': return <Badge variant="destructive">Failed</Badge>;
      default: return <Badge variant="secondary">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Files</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Upload and manage documents</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
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
          "relative border-2 border-dashed rounded-xl p-8 transition-all bg-white dark:bg-zinc-800",
          isDragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
            : uploadProgress.stage !== 'idle'
              ? "border-blue-300 dark:border-blue-700"
              : "border-zinc-300 dark:border-zinc-600 hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer"
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
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <p className="font-medium text-blue-700 dark:text-blue-300">{uploadProgress.message}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <Upload className="w-12 h-12 text-zinc-400 dark:text-zinc-500 mb-4" />
            <p className="font-medium text-zinc-700 dark:text-zinc-300">Drop files here or click to upload</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">PDF or Image (max 50MB)</p>
          </div>
        )}
      </div>

      {/* Error */}
      {uploadError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <span className="text-red-700 dark:text-red-300">{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          type="text"
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
        />
      </div>

      {/* Documents List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <FileText className="w-12 h-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-500 dark:text-zinc-400">No documents found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDocs.map((doc: any) => {
            const linkedAircraft = aircraft.find((a: any) => a._id === doc.aircraft);

            return (
              <div
                key={doc._id}
                className={cn(
                  "bg-white dark:bg-zinc-800 rounded-xl border p-4 transition-all",
                  doc.status === 'parsing' && "border-amber-200 dark:border-amber-800",
                  doc.status === 'failed' && "border-red-200 dark:border-red-800",
                  doc.status === 'completed' && "border-zinc-200 dark:border-zinc-700"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={cn(
                      "p-3 rounded-lg",
                      doc.status === 'parsing' ? "bg-amber-100 dark:bg-amber-900/30" :
                      doc.status === 'failed' ? "bg-red-100 dark:bg-red-900/30" :
                      "bg-zinc-100 dark:bg-zinc-700"
                    )}>
                      {doc.status === 'parsing' ? (
                        <Loader2 className="w-5 h-5 text-amber-600 dark:text-amber-400 animate-spin" />
                      ) : doc.status === 'failed' ? (
                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                      ) : (
                        <FileText className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{doc.filename}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(doc.status)}
                        {linkedAircraft && (
                          <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                            <Plane className="w-3 h-3" /> {linkedAircraft.tailNumber}
                          </span>
                        )}
                        {doc.status === 'completed' && doc.summary && (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {doc.summary.totalEntries} entries
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.status === 'completed' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowLinkModal(doc._id)}
                      >
                        Link
                      </Button>
                    )}
                    {doc.status === 'failed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startParsing.mutate(doc._id, { onSuccess: () => refetch() })}
                      >
                        Retry
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(doc._id)}
                      className="text-red-500 hover:text-red-700"
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
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">Link to Aircraft</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              <button
                onClick={() => {
                  linkDoc.mutate({ docId: showLinkModal, aircraftId: null }, { onSuccess: () => { refetch(); setShowLinkModal(null); } });
                }}
                className="w-full p-3 text-left rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <span className="text-zinc-600 dark:text-zinc-400">Unlink</span>
              </button>
              {aircraft.map((ac: any) => (
                <button
                  key={ac._id}
                  onClick={() => {
                    linkDoc.mutate({ docId: showLinkModal, aircraftId: ac._id }, { onSuccess: () => { refetch(); setShowLinkModal(null); } });
                  }}
                  className="w-full p-3 text-left rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800"
                >
                  <div className="flex items-center gap-3">
                    <Plane className="w-5 h-5 text-blue-500" />
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">{ac.tailNumber}</p>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">{ac.model}</p>
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
    </div>
  );
}
