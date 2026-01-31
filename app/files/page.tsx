'use client';

import { useState, useCallback, useRef } from 'react';
import { FileText, Upload, Loader2, CheckCircle, AlertTriangle, Plane, User, Trash2, RefreshCw } from 'lucide-react';
import { useParsedDocuments, useDeleteParsedDocument, useAircraft, usePilots } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

interface UploadingFile {
  id: string;
  name: string;
  status: 'uploading' | 'processing' | 'done' | 'error';
  progress: number;
  message: string;
  result?: any;
}

export default function FilesPage() {
  const { data: documents = [], isLoading, refetch } = useParsedDocuments();
  const { data: aircraft = [] } = useAircraft();
  const { data: pilots = [] } = usePilots();
  const deleteDocument = useDeleteParsedDocument();

  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Process a single file
  const processFile = async (file: File, fileId: string) => {
    // Update status to uploading
    setUploadingFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, status: 'uploading', progress: 10, message: 'Reading file...' } : f
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
        f.id === fileId ? { ...f, progress: 30, message: 'Uploading & analyzing...' } : f
      ));

      // Call the smart upload endpoint
      const response = await fetch('/api/documents/smart-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64,
          fileType: file.type.includes('pdf') ? 'pdf' : 'image',
          filename: file.name,
        }),
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'progress') {
                setUploadingFiles(prev => prev.map(f =>
                  f.id === fileId ? {
                    ...f,
                    status: 'processing',
                    progress: data.progress,
                    message: data.message
                  } : f
                ));
              } else if (data.type === 'complete') {
                setUploadingFiles(prev => prev.map(f =>
                  f.id === fileId ? {
                    ...f,
                    status: 'done',
                    progress: 100,
                    message: data.message,
                    result: data
                  } : f
                ));
                refetch();
              } else if (data.type === 'error') {
                throw new Error(data.message);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      setUploadingFiles(prev => prev.map(f =>
        f.id === fileId ? {
          ...f,
          status: 'error',
          progress: 0,
          message: (error as Error).message
        } : f
      ));
    }
  };

  // Handle file upload (supports multiple files)
  const handleUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f =>
      f.type.includes('pdf') || f.type.includes('image')
    );

    if (fileArray.length === 0) return;

    // Add all files to uploading state
    const newFiles: UploadingFile[] = fileArray.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      status: 'uploading' as const,
      progress: 0,
      message: 'Queued...'
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
    setUploadingFiles(prev => prev.filter(f => f.status !== 'done' && f.status !== 'error'));
  };

  const handleDelete = (docId: string) => {
    if (confirm('Delete this document?')) {
      deleteDocument.mutate(docId, { onSuccess: () => refetch() });
    }
  };

  // Find linked pilot/aircraft for display
  const getLinkedInfo = (doc: any) => {
    const linkedAircraft = aircraft.find((a: any) => a._id === doc.aircraft);
    const linkedPilot = pilots.find((p: any) => p._id === doc.pilot);
    return { linkedAircraft, linkedPilot };
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Files</h1>
            <p className="text-slate-500 text-sm">Drop files to auto-process, link, and audit</p>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Simple Upload Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all",
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
          <Upload className={cn("w-12 h-12 mx-auto mb-4", isDragging ? "text-blue-500" : "text-slate-400")} />
          <p className="font-medium text-slate-700">
            {isDragging ? "Drop files here" : "Click or drop files"}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            PDF or images - upload multiple at once
          </p>
        </div>

        {/* Uploading Files */}
        {uploadingFiles.length > 0 && (
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-slate-800">Processing</h3>
              <button onClick={clearCompleted} className="text-sm text-slate-500 hover:text-slate-700">
                Clear completed
              </button>
            </div>
            {uploadingFiles.map(file => (
              <div key={file.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="flex-shrink-0">
                  {file.status === 'done' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : file.status === 'error' ? (
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  ) : (
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 truncate">{file.name}</p>
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
                    </div>
                  )}
                </div>
                {file.status !== 'done' && file.status !== 'error' && (
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
        ) : documents.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No documents yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc: any) => {
              const { linkedAircraft, linkedPilot } = getLinkedInfo(doc);

              return (
                <div
                  key={doc._id}
                  className={cn(
                    "flex items-center gap-4 p-4 bg-white rounded-xl border transition-all",
                    doc.status === 'parsing' && "border-amber-200 bg-amber-50/50",
                    doc.status === 'failed' && "border-red-200 bg-red-50/50"
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    "p-2 rounded-lg",
                    doc.status === 'parsing' ? "bg-amber-100" :
                    doc.status === 'failed' ? "bg-red-100" :
                    "bg-slate-100"
                  )}>
                    {doc.status === 'parsing' ? (
                      <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
                    ) : doc.status === 'failed' ? (
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    ) : (
                      <FileText className="w-5 h-5 text-slate-600" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{doc.filename}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
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

                  {/* Links */}
                  <div className="flex items-center gap-2">
                    {linkedPilot && (
                      <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded">
                        <User className="w-3 h-3" /> {linkedPilot.name}
                      </span>
                    )}
                    {linkedAircraft && (
                      <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                        <Plane className="w-3 h-3" /> {linkedAircraft.tailNumber}
                      </span>
                    )}
                  </div>

                  {/* Delete */}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(doc._id)}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
