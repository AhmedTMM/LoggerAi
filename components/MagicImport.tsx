'use client';

import { useState, useCallback } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2, Sparkles, Brain, Zap, Plane, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export function MagicImport() {
    const router = useRouter();
    const [files, setFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
    const [progress, setProgress] = useState<{ current: number; total: number; step: string }>({ current: 0, total: 0, step: '' });
    const [result, setResult] = useState<any>(null);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) {
            setFiles(Array.from(e.dataTransfer.files));
        }
    }, []);

    const startMagic = async () => {
        if (files.length === 0) return;

        setStatus('processing');
        setProgress({ current: 0, total: files.length, step: 'Preparing files...' });

        try {
            // Convert to base64
            const preparedFiles = await Promise.all(
                files.map(async (file) => {
                    return new Promise<any>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve({
                            name: file.name,
                            type: file.type,
                            base64: (reader.result as string).split(',')[1]
                        });
                        reader.readAsDataURL(file);
                    });
                })
            );

            setProgress({ current: 1, total: files.length, step: 'Uploading to Brain...' });

            const response = await fetch('/api/onboarding/system', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: preparedFiles })
            });

            const data = await response.json();

            if (!data.success) throw new Error(data.error);

            setResult(data.data);
            setStatus('success');

            // Refresh dashboard after a delay
            setTimeout(() => {
                router.refresh();
            }, 2000);

        } catch (err) {
            console.error('Magic Error:', err);
            setStatus('error');
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto mb-10">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900 via-violet-900 to-slate-900 shadow-2xl border border-indigo-500/30">

                {/* Background Effects */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

                <div className="relative p-8">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                <Sparkles className="w-6 h-6 text-indigo-400" />
                                Magic System Onboarding
                            </h2>
                            <p className="text-indigo-200 mt-1">Drop your entire history here. We'll build your aviation world.</p>
                        </div>
                        {status === 'idle' && files.length > 0 && (
                            <Button
                                onClick={startMagic}
                                className="bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/25 transition-all hover:scale-105"
                            >
                                <Zap className="w-4 h-4 mr-2 fill-current" />
                                Synthesize Environment ({files.length} Files)
                            </Button>
                        )}
                    </div>

                    {status === 'processing' ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center">
                            <div className="relative mb-6">
                                <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-50 animate-pulse" />
                                <Brain className="w-16 h-16 text-white relative z-10 animate-bounce" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-2">Analyzing Aviation Data</h3>
                            <p className="text-indigo-200 max-w-md mx-auto">
                                Classifying documents, extracting entities, and calculating safety risks...
                            </p>
                            <div className="mt-8 flex gap-4">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
                                    <span className="text-xs text-indigo-300">Gemini 2.0</span>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse delay-75" />
                                    <span className="text-xs text-indigo-300">Reducto</span>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-purple-400 animate-pulse delay-150" />
                                    <span className="text-xs text-indigo-300">Analysis</span>
                                </div>
                            </div>
                        </div>
                    ) : status === 'success' ? (
                        <div className="py-8 bg-green-500/10 rounded-xl border border-green-500/30 text-center animate-in fade-in zoom-in duration-300">
                            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/30">
                                <CheckCircle className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">System Synthesized!</h3>
                            <div className="flex justify-center gap-8 mt-4">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-green-400">{result?.pilots?.length || 0}</div>
                                    <div className="text-xs text-green-200 uppercase tracking-wider">Pilots</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-green-400">{result?.aircraft?.length || 0}</div>
                                    <div className="text-xs text-green-200 uppercase tracking-wider">Aircraft</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-green-400">{result?.flights?.length || 0}</div>
                                    <div className="text-xs text-green-200 uppercase tracking-wider">Missions</div>
                                </div>
                            </div>
                            <p className="text-green-200 mt-6 text-sm">Redirecting to Dashboard...</p>
                        </div>
                    ) : (
                        <div
                            onDrop={handleDrop}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            className={cn(
                                "border-2 border-dashed rounded-xl h-64 flex flex-col items-center justify-center transition-all duration-300",
                                isDragging
                                    ? "border-indigo-400 bg-indigo-500/20 scale-105"
                                    : "border-indigo-500/30 hover:border-indigo-400 hover:bg-white/5 bg-black/20"
                            )}
                        >
                            {files.length > 0 ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full p-6 max-h-60 overflow-y-auto">
                                    {files.map((f, i) => (
                                        <div key={i} className="bg-indigo-900/40 p-3 rounded-lg flex items-center gap-3 border border-indigo-500/30">
                                            <FileText className="w-5 h-5 text-indigo-300" />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium text-white truncate">{f.name}</div>
                                                <div className="text-xs text-indigo-300">{(f.size / 1024).toFixed(0)} KB</div>
                                            </div>
                                            <button
                                                onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                                                className="text-indigo-400 hover:text-white"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    <div
                                        className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-indigo-500/30 rounded-lg text-indigo-400 hover:text-white hover:bg-white/5 cursor-pointer"
                                        onClick={() => {
                                            // Hack to trigger file input
                                            document.getElementById('magic-input')?.click();
                                        }}
                                    >
                                        <span className="text-2xl">+</span>
                                        <span className="text-xs">Add More</span>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <Upload className="w-12 h-12 text-indigo-400 mb-4 opacity-80" />
                                    <p className="text-lg font-medium text-white">Drop Logbooks & Records Here</p>
                                    <p className="text-indigo-300 text-sm mt-2">
                                        Or <span className="text-indigo-400 underline cursor-pointer">browse files</span>
                                    </p>
                                </>
                            )}
                            <input
                                id="magic-input"
                                type="file"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    if (e.target.files?.length) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                                }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
