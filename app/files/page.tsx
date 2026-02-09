'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { FileText, Upload, Loader2, CheckCircle, AlertTriangle, Plane, User, Trash2, RefreshCw } from 'lucide-react';
import { useParsedDocuments, useDeleteParsedDocument, useAircraft, usePilots } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

interface UploadingFile {
  id: string;
  documentId?: string;
  name: string;
  status: 'uploading' | 'queued' | 'parsing' | 'completed' | 'failed';
  progress: number;
  message: string;
  result?: any;
  startTime: number;    // Date.now() when upload began
  endTime?: number;     // Date.now() when completed/failed
}

/** Format elapsed ms as "Xs" or "M:SS" */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const STORAGE_KEY = 'aviation-bg-uploads';

export default function FilesPage() {
  const { data: documents = [], isLoading, refetch } = useParsedDocuments();
  const { data: aircraft = [], refetch: refetchAircraft } = useAircraft();
  const { data: pilots = [], refetch: refetchPilots } = usePilots();
  const deleteDocument = useDeleteParsedDocument();

  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRestoringUploads, setIsRestoringUploads] = useState(true);
  const [now, setNow] = useState(Date.now());

  // Store active polling intervals
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Tick every second while uploads are active (for live timer)
  useEffect(() => {
    const hasActive = uploadingFiles.some(f => f.status !== 'completed' && f.status !== 'failed');
    if (!hasActive) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [uploadingFiles]);

  // Poll status for a document
  const pollDocumentStatus = useCallback(async (fileId: string, documentId: string) => {
    try {
      const response = await fetch(`/api/documents/status?documentId=${documentId}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      // Update the file status
      const isDone = data.status === 'completed' || data.status === 'failed';
      setUploadingFiles(prev => prev.map(f =>
        f.id === fileId ? {
          ...f,
          status: data.status,
          progress: data.progress,
          message: data.progressStep || data.status,
          result: data.status === 'completed' ? {
            ...data,
            entryCount: data.summary?.totalEntries,
            totalHours: data.summary?.totalHours,
          } : undefined,
          ...(isDone && !f.endTime ? { endTime: Date.now() } : {}),
        } : f
      ));

      // If completed or failed, stop polling and refresh documents
      if (data.status === 'completed' || data.status === 'failed') {
        const interval = pollingIntervalsRef.current.get(fileId);
        if (interval) {
          clearInterval(interval);
          pollingIntervalsRef.current.delete(fileId);
        }
        if (data.status === 'completed') {
          refetch();
        }
      }
    } catch (error) {
      console.error('Error polling status:', error);
    }
  }, [refetch]);

  // Process a single file
  const processFile = async (file: File, fileId: string) => {
    // Update status to uploading
    setUploadingFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, status: 'uploading', progress: 5, message: 'Reading file...' } : f
    ));

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

      setUploadingFiles(prev => prev.map(f =>
        f.id === fileId ? { ...f, progress: 20, message: 'Uploading...' } : f
      ));

      // Call the background upload endpoint
      const response = await fetch('/api/documents/background-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64,
          fileType: file.type.includes('pdf') ? 'pdf' : 'image',
          filename: file.name,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      // Update with document ID and queued status
      setUploadingFiles(prev => prev.map(f =>
        f.id === fileId ? {
          ...f,
          documentId: data.documentId,
          status: 'queued',
          progress: 25,
          message: 'Queued...',
          result: data
        } : f
      ));

      // Start polling for status updates
      const interval = setInterval(() => {
        pollDocumentStatus(fileId, data.documentId);
      }, 2000); // Poll every 2 seconds

      pollingIntervalsRef.current.set(fileId, interval);

      // Do an immediate poll
      pollDocumentStatus(fileId, data.documentId);

    } catch (error) {
      setUploadingFiles(prev => prev.map(f =>
        f.id === fileId ? {
          ...f,
          status: 'failed',
          progress: 0,
          message: (error as Error).message,
          endTime: Date.now(),
        } : f
      ));
    }
  };

  // Save ongoing uploads to localStorage
  useEffect(() => {
    const activeUploads = uploadingFiles
      .filter(f => f.status !== 'completed' && f.status !== 'failed' && f.documentId)
      .map(f => ({
        id: f.id,
        documentId: f.documentId,
        name: f.name,
        startTime: f.startTime,
      }));

    if (activeUploads.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeUploads));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [uploadingFiles]);

  // Restore ongoing uploads from localStorage on mount
  useEffect(() => {
    const restoreUploads = async () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setIsRestoringUploads(false);
        return;
      }

      try {
        const savedUploads = JSON.parse(stored) as { id: string; documentId: string; name: string; startTime?: number }[];

        if (savedUploads.length === 0) {
          setIsRestoringUploads(false);
          return;
        }

        // Fetch status for all saved uploads
        const response = await fetch('/api/documents/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentIds: savedUploads.map(u => u.documentId),
          }),
        });

        const data = await response.json();

        if (data.success) {
          const restoredFiles: UploadingFile[] = savedUploads
            .map(upload => {
              const status = data.documents[upload.documentId];
              if (!status) return null;

              // Only restore if still processing
              if (status.status === 'completed' || status.status === 'failed') {
                return null;
              }

              return {
                id: upload.id,
                documentId: upload.documentId,
                name: upload.name,
                status: status.status,
                progress: status.progress,
                message: status.progressStep || status.status,
                startTime: upload.startTime || Date.now(),
              };
            })
            .filter(Boolean) as UploadingFile[];

          if (restoredFiles.length > 0) {
            setUploadingFiles(restoredFiles);

            // Start polling for restored files
            restoredFiles.forEach(file => {
              if (file.documentId) {
                const interval = setInterval(() => {
                  pollDocumentStatus(file.id, file.documentId!);
                }, 2000);
                pollingIntervalsRef.current.set(file.id, interval);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error restoring uploads:', error);
      } finally {
        setIsRestoringUploads(false);
      }
    };

    restoreUploads();
  }, [pollDocumentStatus]);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      pollingIntervalsRef.current.forEach(interval => clearInterval(interval));
      pollingIntervalsRef.current.clear();
    };
  }, []);

  // Auto-refresh for documents that are still processing
  useEffect(() => {
    if (!documents || documents.length === 0) return;

    const processingDocs = documents.filter((doc: any) =>
      doc.status === 'queued' || doc.status === 'parsing' || doc.status === 'analyzing'
    );

    if (processingDocs.length === 0) return;

    // Refresh every 3 seconds while there are processing documents
    const interval = setInterval(() => {
      refetch();
    }, 3000);

    return () => clearInterval(interval);
  }, [documents, refetch]);

  // Auto-reconcile unlinked documents (runs once when documents load)
  // Only triggers if there are completed docs missing links that could be resolved
  const reconcileRanRef = useRef(false);
  useEffect(() => {
    if (reconcileRanRef.current || !documents || documents.length === 0) return;
    const PILOT_TYPES = ['pilot_logbook', 'medical', 'certificate', 'endorsement', 'checkout'];
    const AIRCRAFT_TYPES = ['aircraft_logbook', 'maintenance', 'inspection', 'poh', 'weight_balance', 'insurance', 'registration', 'ad_compliance', 'service_bulletin'];
    const hasUnlinked = documents.some((doc: any) => {
      if (doc.status !== 'completed') return false;
      const dt = doc.documentType || 'other';
      // Pilot doc missing pilot link
      if (!doc.pilot && PILOT_TYPES.includes(dt)) return true;
      // Aircraft doc missing aircraft link
      if (!doc.aircraft && AIRCRAFT_TYPES.includes(dt)) return true;
      return false;
    });
    if (!hasUnlinked) return;
    reconcileRanRef.current = true;
    fetch('/api/documents/reconcile-links', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.reconciled > 0) {
          refetch();
          // If aircraft were created during reconciliation, refresh aircraft list too
          if (data.created?.aircraft > 0) refetchAircraft();
        }
      })
      .catch(err => console.error('Reconcile error:', err));
  }, [documents, refetch, refetchAircraft]);

  // Handle file upload (supports multiple files)
  const handleUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f =>
      f.type.includes('pdf') || f.type.includes('image')
    );

    if (fileArray.length === 0) return;

    // Add all files to uploading state
    const now = Date.now();
    const newFiles: UploadingFile[] = fileArray.map(file => ({
      id: `${now}-${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      status: 'uploading' as const,
      progress: 0,
      message: 'Queued...',
      startTime: now,
    }));

    setUploadingFiles(prev => [...prev, ...newFiles]);

    // Process all files in parallel
    await Promise.all(
      fileArray.map((file, index) => processFile(file, newFiles[index].id))
    );
  }, [refetch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      handleUpload(e.dataTransfer.files);
    }
  }, [handleUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleUpload(e.target.files);
    }
    e.target.value = '';
  }, [handleUpload]);

  const clearCompleted = () => {
    // Stop polling for cleared items
    uploadingFiles
      .filter(f => f.status === 'completed' || f.status === 'failed')
      .forEach(f => {
        const interval = pollingIntervalsRef.current.get(f.id);
        if (interval) {
          clearInterval(interval);
          pollingIntervalsRef.current.delete(f.id);
        }
      });
    setUploadingFiles(prev => prev.filter(f => f.status !== 'completed' && f.status !== 'failed'));
  };

  const handleDelete = (docId: string) => {
    deleteDocument.mutate(docId, { onSuccess: () => refetch() });
  };

  // Find linked pilot/aircraft for display
  // Falls back to analysis/filename matching when formal DB link is missing
  // Document-type-aware: pilot docs only link to pilots, aircraft docs only link to aircraft
  const getLinkedInfo = (doc: any) => {
    const docType = doc.documentType || 'other';
    const PILOT_TYPES = ['pilot_logbook', 'medical', 'certificate', 'endorsement', 'checkout'];
    const AIRCRAFT_TYPES = ['aircraft_logbook', 'maintenance', 'inspection', 'poh', 'weight_balance', 'insurance', 'registration', 'ad_compliance', 'service_bulletin'];
    const isPilotDoc = PILOT_TYPES.includes(docType);
    const isAircraftDoc = AIRCRAFT_TYPES.includes(docType);

    // Formal DB links — but ONLY show cross-type-appropriate links.
    // Pilot logbooks may have doc.aircraft set from upload (the aircraft the pilot flew),
    // but that's NOT an ownership link and shouldn't display as one.
    let linkedAircraft = (doc.aircraft && !isPilotDoc)
      ? aircraft.find((a: any) => String(a._id) === String(doc.aircraft))
      : undefined;
    let linkedPilot = (doc.pilot && !isAircraftDoc)
      ? pilots.find((p: any) => String(p._id) === String(doc.pilot))
      : undefined;

    // Fallback aircraft matching — ONLY for aircraft-type documents
    // (Pilot logbooks mention many aircraft in their entries; those are NOT ownership links)
    if (!linkedAircraft && isAircraftDoc && aircraft.length > 0) {
      // 1. Try tail numbers from AI analysis
      const analysisTails: string[] = doc.analysis?.matchedAircraftTails || doc.analysis?.aircraftTailNumbers || [];
      // 2. Try extracting N-number from filename
      const filenameTails: string[] = [];
      if (doc.filename) {
        const m = doc.filename.match(/\b(N[0-9A-Z]{1,5})\b/i);
        if (m) filenameTails.push(m[1].toUpperCase());
      }
      // Combine, deduplicate, filename first (more reliable for aircraft docs)
      const allTails = Array.from(new Set(filenameTails.concat(analysisTails)));

      for (const tail of allTails) {
        const norm = tail.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const match = aircraft.find((a: any) => {
          const at = (a.tailNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          return at === norm || at.includes(norm) || norm.includes(at);
        });
        if (match) { linkedAircraft = match; break; }
      }
    }

    // Fallback pilot matching — ONLY for pilot-type documents
    if (!linkedPilot && isPilotDoc && pilots.length > 0) {
      const name = doc.analysis?.matchedPilotName || doc.analysis?.pilotName;
      if (name && name.length >= 2) {
        const norm = name.toLowerCase();
        linkedPilot = pilots.find((p: any) => {
          const pn = (p.name || '').toLowerCase();
          return pn.includes(norm) || norm.includes(pn);
        });
      }
    }

    return { linkedAircraft, linkedPilot };
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Files</h1>
            <p className="text-slate-500 text-xs sm:text-sm">Drop files to auto-process, link, and audit</p>
          </div>
        </div>

        {/* Simple Upload Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 sm:p-12 text-center cursor-pointer transition-all",
            isDragging
              ? "border-blue-500 bg-blue-50"
              : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            multiple
            onChange={handleFileInput}
            className="hidden"
          />
          <Upload className={cn("w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4", isDragging ? "text-blue-500" : "text-slate-400")} />
          <p className="font-medium text-slate-700 text-sm sm:text-base">
            {isDragging ? "Drop files here" : "Click or drop files"}
          </p>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            PDF or images - upload multiple at once
          </p>
        </div>

        {/* Upload Status Message */}
        {uploadingFiles.some(f => f.status !== 'completed' && f.status !== 'failed') && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-blue-900">Processing in background</p>
              <p className="text-sm text-blue-700 mt-1">
                You can close this page - uploads will continue processing. Come back anytime to check progress.
              </p>
            </div>
          </div>
        )}

        {/* Uploading Files */}
        {uploadingFiles.length > 0 && (
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-slate-800">
                {isRestoringUploads ? 'Restoring uploads...' : 'Processing'}
              </h3>
              <button onClick={clearCompleted} className="text-sm text-slate-500 hover:text-slate-700">
                Clear completed
              </button>
            </div>
            {uploadingFiles.map(file => (
              <div key={file.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="flex-shrink-0">
                  {file.status === 'completed' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : file.status === 'failed' ? (
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  ) : (
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-800 truncate">{file.name}</p>
                    <span className={cn(
                      "text-xs font-mono tabular-nums flex-shrink-0",
                      file.endTime ? "text-slate-400" : "text-blue-600"
                    )}>
                      {formatElapsed((file.endTime || now) - file.startTime)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">{file.message}</p>
                  {file.result?.created && (
                    <div className="flex gap-2 mt-1">
                      {file.result.created.pilot && (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          + New Pilot
                        </Badge>
                      )}
                      {file.result.created.aircraft && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                          + New Aircraft
                        </Badge>
                      )}
                      {file.result.auditStatus && (
                        <Badge
                          variant="outline"
                          className={cn("text-xs",
                            file.result.auditStatus === 'go' ? "bg-green-50 text-green-700 border-green-200" :
                            file.result.auditStatus === 'caution' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                            "bg-red-50 text-red-700 border-red-200"
                          )}
                        >
                          Audit: {file.result.auditStatus.toUpperCase()}
                        </Badge>
                      )}
                      {file.result.entryCount && (
                        <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700 border-slate-200">
                          {file.result.entryCount} entries
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                {file.status !== 'completed' && file.status !== 'failed' && (
                  <div className="w-20">
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Documents List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : documents.length === 0 && uploadingFiles.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No documents yet</p>
          </div>
        ) : documents.length > 0 ? (
          <div className="space-y-2">
            {documents.map((doc: any) => {
              const { linkedAircraft, linkedPilot } = getLinkedInfo(doc);

              return (
                <div
                  key={doc._id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-white rounded-xl border transition-all",
                    (doc.status === 'parsing' || doc.status === 'queued' || doc.status === 'analyzing') && "border-amber-200 bg-amber-50/50",
                    doc.status === 'failed' && "border-red-200 bg-red-50/50"
                  )}
                >
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    {/* Icon */}
                    <div className={cn(
                      "p-2 rounded-lg flex-shrink-0",
                      (doc.status === 'parsing' || doc.status === 'queued' || doc.status === 'analyzing') ? "bg-amber-100" :
                      doc.status === 'failed' ? "bg-red-100" :
                      "bg-slate-100"
                    )}>
                      {(doc.status === 'parsing' || doc.status === 'queued' || doc.status === 'analyzing') ? (
                        <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 animate-spin" />
                      ) : doc.status === 'failed' ? (
                        <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                      ) : (
                        <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate text-sm sm:text-base">{doc.filename}</p>
                      <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {doc.documentType || 'other'}
                        </Badge>
                        {doc.status === 'completed' && doc.summary && (
                          <span className="text-xs text-slate-500">
                            {doc.summary.totalEntries} entries
                            {doc.summary.totalHours > 0 && ` • ${doc.summary.totalHours}h`}
                          </span>
                        )}
                        {doc.status === 'failed' && (
                          <span className="text-xs text-red-600">{doc.error || 'Failed'}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Links and Delete */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 pl-11 sm:pl-0">
                    <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                      {linkedPilot && (
                        <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded">
                          <User className="w-3 h-3" /> <span className="hidden xs:inline">{linkedPilot.name}</span>
                        </span>
                      )}
                      {linkedAircraft && (
                        <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded">
                          <Plane className="w-3 h-3" /> {linkedAircraft.tailNumber}
                        </span>
                      )}
                    </div>

                    {/* Delete */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(doc._id)}
                      className="text-slate-400 hover:text-red-600 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
