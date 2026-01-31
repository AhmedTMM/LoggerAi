'use client';

import { useState, useEffect } from 'react';
import { User, Plus, Clock, X, Shield, AlertTriangle, CheckCircle, Plane, Upload, Trash2, Loader2, FileText, Target, TrendingUp, RefreshCw, Search, ChevronDown, ChevronUp, Wrench, Book, Sparkles, Microscope } from 'lucide-react';
import { usePilots, useCreatePilot, useAircraft, useCreateFlight, useDeletePilot, useParseDocument, useParsedDocuments, useApplyLogbook, useUpdatePilot } from '@/lib/hooks';
import type { Pilot, Aircraft } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { MetricCard } from '@/components/ui/MetricCard';
import { cn } from '@/lib/utils';

type TabType = 'overview' | 'logbook' | 'safety';

export default function PilotsPage() {
  const { data: pilots, isLoading, error, refetch } = usePilots();
  const { data: aircraft } = useAircraft();
  const createPilot = useCreatePilot();
  const deletePilot = useDeletePilot();
  const updatePilot = useUpdatePilot();
  const createFlight = useCreateFlight();
  const parseDocument = useParseDocument();
  const { data: parsedDocs = [], refetch: refetchDocs } = useParsedDocuments();
  const applyLogbook = useApplyLogbook();

  const [selectedPilot, setSelectedPilot] = useState<Pilot | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPlanFlightModal, setShowPlanFlightModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [docSearchQuery, setDocSearchQuery] = useState('');

  // Safety Data State
  const [safetyData, setSafetyData] = useState<{ reports: any[] } | null>(null);
  const [loadingSafety, setLoadingSafety] = useState(false);

  type AnalysisResult = {
    risk_factors: { category: string; riskLevel: 'high' | 'medium' | 'low'; message: string }[];
    overall_assessment: { score: number; summary: string };
  };
  const [aiAnalysis, setAiAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [lastAnalyzedPilotId, setLastAnalyzedPilotId] = useState<string | null>(null);

  // Initialize AI analysis from persistent storage
  useEffect(() => {
    if (selectedPilot?._id && selectedPilot._id !== lastAnalyzedPilotId) {
      setLastAnalyzedPilotId(selectedPilot._id as string);

      if (selectedPilot.safetyAnalysis) {
        // Load existing analysis
        setAiAnalysis({
          risk_factors: selectedPilot.safetyAnalysis.findings,
          overall_assessment: {
            score: selectedPilot.safetyAnalysis.score,
            summary: "Loaded from database." // Summary isn't currently saved in findings, just score/factors
          }
        });
      } else {
        // Auto-run only if missing
        setAiAnalysis(null);
        handleRunAIAnalysis(selectedPilot._id as string);
      }
    }
  }, [selectedPilot]);

  useEffect(() => {
    if (activeTab === 'safety' && selectedPilot && !safetyData) {
      fetchSafetyData();
    }
  }, [activeTab, selectedPilot]);

  const fetchSafetyData = async () => {
    if (!selectedPilot) return;
    setLoadingSafety(true);
    try {
      const res = await fetch(`/api/pilots/safety?name=${encodeURIComponent(selectedPilot.name)}`);
      const data = await res.json();
      if (data.success) {
        setSafetyData(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch pilot safety data', err);
    } finally {
      setLoadingSafety(false);
    }
  };

  const handleRunAIAnalysis = async (pilotId: string) => {
    setAnalyzingAI(true);
    try {
      const res = await fetch(`/api/pilots/${pilotId}/ai-safety`, { method: 'POST' });
      const data = await res.json();
      if (data.analysis) {
        setAiAnalysis(data.analysis);
      } else {
        console.error('AI Analysis failed:', data.error);
      }
    } catch (err) {
      console.error('Failed to run AI analysis', err);
    } finally {
      setAnalyzingAI(false);
    }
  };

  const handleLogbookUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPilot) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      parseDocument.mutate({
        fileBase64: base64,
        fileType: file.type.includes('pdf') ? 'pdf' : 'image',
        documentType: 'logbook',
        pilotId: selectedPilot._id,
        filename: file.name,
      }, {
        onSuccess: async () => {
          const result = await refetch();
          // Update selectedPilot with refreshed data
          if (result.data && selectedPilot) {
            const updated = result.data.find((p: Pilot) => p._id === selectedPilot._id);
            if (updated) setSelectedPilot(updated);
          }
        },
      });
    };
    reader.readAsDataURL(file);
  };

  const getDaysUntil = (date: Date | string) => Math.ceil((new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  const getCertificateLabel = (type: string) => ({ Student: 'Student Pilot', PPL: 'Private Pilot', CPL: 'Commercial Pilot', ATP: 'Airline Transport Pilot', Sport: 'Sport Pilot' }[type] || type);

  // Safety Gap Analysis
  const getSafetyGaps = (pilot: Pilot) => {
    const gaps: { type: 'warning' | 'info'; label: string; detail: string }[] = [];

    // Medical check
    const medicalDays = getDaysUntil(pilot.medicalExpiration);
    if (medicalDays < 0) {
      gaps.push({ type: 'warning', label: 'Medical Expired', detail: 'Cannot act as PIC' });
    } else if (medicalDays < 30) {
      gaps.push({ type: 'warning', label: 'Medical Expiring', detail: `${medicalDays} days remaining` });
    }

    // Flight Review check
    const frDays = getDaysUntil(pilot.flightReviewExpiration);
    if (frDays < 0) {
      gaps.push({ type: 'warning', label: 'Flight Review Expired', detail: 'Cannot act as PIC' });
    } else if (frDays < 60) {
      gaps.push({ type: 'warning', label: 'Flight Review Due', detail: `${frDays} days remaining` });
    }

    // Experience gaps
    if ((pilot.experience?.nightHours || 0) < 15) {
      gaps.push({ type: 'info', label: 'Low Night Experience', detail: `${pilot.experience?.nightHours || 0} hours (recommend 15+)` });
    }
    if ((pilot.experience?.ifrHours || 0) < 20 && pilot.certificates?.instrumentRated) {
      gaps.push({ type: 'info', label: 'Low IFR Experience', detail: `${pilot.experience?.ifrHours || 0} hours (recommend 20+)` });
    }
    if ((pilot.experience?.totalHours || 0) < 100) {
      gaps.push({ type: 'info', label: 'Low Total Time', detail: `${pilot.experience?.totalHours || 0} hours - exercise extra caution` });
    }

    return gaps;
  };

  const renderRiskCard = (factor: { category: string; riskLevel: 'high' | 'medium' | 'low'; message: string }, index: number) => {
    const colors = {
      high: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900', icon: 'text-red-600' },
      medium: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', icon: 'text-amber-600' },
      low: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', icon: 'text-emerald-600' }
    };
    const style = colors[factor.riskLevel] || colors.low;

    return (
      <div key={index} className={cn("p-4 rounded-xl border flex gap-3 transition-all hover:shadow-md", style.bg, style.border)}>
        <AlertTriangle className={cn("h-5 w-5 flex-shrink-0 mt-0.5", style.icon)} />
        <div>
          <h4 className={cn("font-bold text-sm", style.text)}>{factor.category}</h4>
          <p className={cn("text-sm mt-1 opacity-90 leading-relaxed", style.text)}>{factor.message}</p>
        </div>
      </div>
    );
  };

  if (isLoading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div></div>;
  if (error) return <div className="text-center py-12"><AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" /><p className="text-zinc-600">Failed to load pilots.</p></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Pilot Roster</h1>
          <p className="text-sm text-zinc-500">Logbooks, certifications, and safety analysis.</p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Pilot
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Total Pilots" value={pilots?.length || 0} />
        <MetricCard label="Instructors" value={pilots?.filter(p => p.certificates.type === 'CPL' || p.certificates.type === 'ATP').length || 0} />
        <MetricCard label="Instrument Rated" value={pilots?.filter(p => p.certificates.instrumentRated).length || 0} />
        <MetricCard label="Expiring Medicals" value={pilots?.filter(p => getDaysUntil(p.medicalExpiration) < 30).length || 0} className={pilots?.filter(p => getDaysUntil(p.medicalExpiration) < 30).length ? "border-l-4 border-l-amber-500" : ""} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[500px]">
        {/* Pilot List */}
        <div className="lg:col-span-1 border border-zinc-200 rounded-xl bg-white flex flex-col overflow-hidden shadow-sm">
          <div className="p-3 border-b border-zinc-100 bg-zinc-50/50">
            <input
              type="text"
              placeholder="Search pilots..."
              className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-1">
            {pilots?.map((pilot) => {
              const medicalDays = getDaysUntil(pilot.medicalExpiration);
              const frDays = getDaysUntil(pilot.flightReviewExpiration);
              const hasIssue = medicalDays < 30 || frDays < 60;
              const isSelected = selectedPilot?._id === pilot._id;

              return (
                <div
                  key={pilot._id}
                  onClick={() => { setSelectedPilot(pilot); setActiveTab('overview'); setSafetyData(null); }}
                  className={cn(
                    "group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border border-transparent",
                    isSelected ? "bg-blue-50 border-blue-200 shadow-sm" : "hover:bg-zinc-50 hover:border-zinc-200"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border",
                    isSelected ? "bg-blue-100 text-blue-700 border-blue-200" : "bg-zinc-100 text-zinc-500 border-zinc-200"
                  )}>
                    {pilot.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className={cn("font-medium truncate text-sm", isSelected ? "text-blue-900" : "text-zinc-900")}>{pilot.name}</h3>
                      {hasIssue && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 h-5 font-normal">{pilot.certificates.type}</Badge>
                      <span className="text-[10px] text-zinc-400">{pilot.experience?.totalHours || 0} hrs</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pilot Details Panel */}
        <div className="lg:col-span-2 border border-zinc-200 rounded-xl bg-white flex flex-col shadow-sm overflow-hidden">
          {selectedPilot ? (
            <>
              {/* Detail Header */}
              <div className="p-6 border-b border-zinc-100 flex items-start justify-between bg-zinc-50/30">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white border border-zinc-200 rounded-full flex items-center justify-center shadow-sm text-xl font-bold text-zinc-500">
                    {selectedPilot.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-zinc-900">{selectedPilot.name}</h2>
                    <p className="text-sm text-zinc-500 font-mono">{selectedPilot.email}</p>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="outline">{getCertificateLabel(selectedPilot.certificates.type)}</Badge>
                      {selectedPilot.certificates.instrumentRated && <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">IR</Badge>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowPlanFlightModal(true)}>
                    <Plane className="w-4 h-4 mr-2" /> Plan Flight
                  </Button>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => setShowDeleteModal(true)}>
                    <Trash2 className="w-4 h-4 text-zinc-400 hover:text-red-500" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => setSelectedPilot(null)}>
                    <X className="w-4 h-4 text-zinc-400" />
                  </Button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-zinc-100 px-6">
                <button onClick={() => setActiveTab('overview')} className={cn("px-4 py-3 text-sm font-medium border-b-2 transition-colors", activeTab === 'overview' ? "border-blue-600 text-blue-600" : "border-transparent text-zinc-500 hover:text-zinc-700")}>Overview</button>
                <button onClick={() => setActiveTab('logbook')} className={cn("px-4 py-3 text-sm font-medium border-b-2 transition-colors", activeTab === 'logbook' ? "border-blue-600 text-blue-600" : "border-transparent text-zinc-500 hover:text-zinc-700")}>Logbook</button>
                <button onClick={() => { setActiveTab('safety'); setSafetyData(null); }} className={cn("px-4 py-3 text-sm font-medium border-b-2 transition-colors", activeTab === 'safety' ? "border-orange-500 text-orange-600" : "border-transparent text-zinc-500 hover:text-zinc-700")}>Safety</button>
              </div>

              {/* Content Area */}
              <div className="p-6 overflow-y-auto flex-1 bg-zinc-50/50">
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Experience Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="p-4 bg-white rounded-lg border border-zinc-200 shadow-sm">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Hours</div>
                        <div className="text-2xl font-bold tabular-nums text-zinc-900">{selectedPilot.experience?.totalHours || 0}</div>
                      </div>
                      <div className="p-4 bg-white rounded-lg border border-zinc-200 shadow-sm">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">PIC</div>
                        <div className="text-2xl font-bold tabular-nums text-zinc-900">{selectedPilot.experience?.picHours || 0}</div>
                      </div>
                      <div className="p-4 bg-white rounded-lg border border-zinc-200 shadow-sm">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Night</div>
                        <div className="text-2xl font-bold tabular-nums text-zinc-900">{selectedPilot.experience?.nightHours || 0}</div>
                      </div>
                      <div className="p-4 bg-white rounded-lg border border-zinc-200 shadow-sm">
                        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Total Sorties</div>
                        <div className="text-2xl font-bold tabular-nums text-zinc-900">{selectedPilot.flightEntries?.length || 0}</div>
                      </div>
                      <div className={cn("p-4 rounded-lg border shadow-sm relative overflow-hidden",
                        aiAnalysis
                          ? aiAnalysis.overall_assessment.score >= 7 ? "bg-red-50 border-red-200"
                            : aiAnalysis.overall_assessment.score >= 4 ? "bg-amber-50 border-amber-200"
                              : "bg-emerald-50 border-emerald-200"
                          : "bg-white border-zinc-200"
                      )}>
                        <div className={cn("text-xs uppercase tracking-wider mb-1 font-semibold",
                          aiAnalysis
                            ? aiAnalysis.overall_assessment.score >= 7 ? "text-red-700"
                              : aiAnalysis.overall_assessment.score >= 4 ? "text-amber-700"
                                : "text-emerald-700"
                            : "text-zinc-500"
                        )}>Safety Score</div>
                        <div className={cn("text-2xl font-bold tabular-nums",
                          aiAnalysis
                            ? aiAnalysis.overall_assessment.score >= 7 ? "text-red-900"
                              : aiAnalysis.overall_assessment.score >= 4 ? "text-amber-900"
                                : "text-emerald-900"
                            : "text-zinc-400"
                        )}>
                          {aiAnalysis ? aiAnalysis.overall_assessment.score : "-"}
                        </div>
                        {analyzingAI && !aiAnalysis && (
                          <div className="absolute inset-0 bg-white/50 flex items-center justify-center backdrop-blur-[1px]">
                            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Safety Gaps */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-zinc-900 flex items-center"><Target className="w-4 h-4 mr-2" /> Safety Gap Analysis</h3>
                      {getSafetyGaps(selectedPilot).length > 0 ? (
                        <div className="space-y-2">
                          {getSafetyGaps(selectedPilot).map((gap, i) => (
                            <div key={i} className={cn("p-3 rounded-lg border flex items-center gap-3", gap.type === 'warning' ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200")}>
                              {gap.type === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-600" /> : <TrendingUp className="w-4 h-4 text-blue-600" />}
                              <div>
                                <span className={cn("font-medium text-sm", gap.type === 'warning' ? "text-amber-900" : "text-blue-900")}>{gap.label}</span>
                                <span className="text-xs text-zinc-500 ml-2">{gap.detail}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                          <span className="text-emerald-800 font-medium">All currency and experience checks passed</span>
                        </div>
                      )}
                    </div>

                    {/* Currency */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <CurrencyItem label="Medical Certificate" expiration={selectedPilot.medicalExpiration} />
                      <CurrencyItem label="Flight Review" expiration={selectedPilot.flightReviewExpiration} />
                    </div>
                  </div>
                )}

                {activeTab === 'logbook' && (
                  <div className="space-y-6">
                    {/* Upload Area */}
                    <div className="border-2 border-dashed border-zinc-300 rounded-xl p-6 text-center hover:border-zinc-400 transition-colors">
                      <input type="file" accept="image/*,.pdf" onChange={handleLogbookUpload} className="hidden" id="pilot-logbook-upload" disabled={parseDocument.isPending} />
                      <label htmlFor="pilot-logbook-upload" className="cursor-pointer">
                        {parseDocument.isPending ? (
                          <div className="flex flex-col items-center">
                            <Loader2 className="w-10 h-10 text-blue-500 mb-3 animate-spin" />
                            <p className="text-sm font-medium text-blue-600">Parsing logbook...</p>
                            <p className="text-xs text-zinc-500">This may take a moment</p>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-10 h-10 mx-auto text-zinc-400 mb-3" />
                            <p className="text-sm font-medium text-zinc-700">Upload Pilot Logbook</p>
                            <p className="text-xs text-zinc-500 mt-1">PDF or image - we'll extract all flight entries</p>
                          </>
                        )}
                      </label>
                    </div>

                    {/* Hour Summary (from parsed data) */}
                    {selectedPilot.flightEntries && selectedPilot.flightEntries.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 bg-white rounded-lg border border-zinc-200">
                          <div className="text-xs text-zinc-500 uppercase tracking-wider">Total Entries</div>
                          <div className="text-xl font-bold text-zinc-900">{selectedPilot.flightEntries.length}</div>
                        </div>
                        <div className="p-3 bg-white rounded-lg border border-zinc-200">
                          <div className="text-xs text-zinc-500 uppercase tracking-wider">Total Hours</div>
                          <div className="text-xl font-bold text-zinc-900">{selectedPilot.experience?.totalHours || 0}</div>
                        </div>
                        <div className="p-3 bg-white rounded-lg border border-zinc-200">
                          <div className="text-xs text-zinc-500 uppercase tracking-wider">Night Hours</div>
                          <div className="text-xl font-bold text-zinc-900">{selectedPilot.experience?.nightHours || 0}</div>
                        </div>
                        <div className="p-3 bg-white rounded-lg border border-zinc-200">
                          <div className="text-xs text-zinc-500 uppercase tracking-wider">XC Hours</div>
                          <div className="text-xl font-bold text-zinc-900">{(selectedPilot.experience as any)?.crossCountryHours || 0}</div>
                        </div>
                      </div>
                    )}

                    {/* Document Library - Linked Documents */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                          <Book className="w-4 h-4" />
                          Linked Documents
                        </h3>
                        <Button size="sm" onClick={() => setShowAddDocModal(true)} className="h-8">
                          <Plus className="w-4 h-4 mr-1.5" /> Add Document
                        </Button>
                      </div>

                      {selectedPilot.linkedDocuments && selectedPilot.linkedDocuments.length > 0 ? (
                        <div className="grid gap-3">
                          {parsedDocs
                            .filter((d: any) => selectedPilot.linkedDocuments?.includes(d._id))
                            .map((doc: any) => {
                              const isLogbook = doc.documentType === 'logbook';
                              const Icon = isLogbook ? Book : Wrench;
                              return (
                                <div key={doc._id} className="group relative rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                                  <div className="flex items-start gap-3">
                                    <div className={cn(
                                      "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                                      isLogbook ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                                    )}>
                                      <Icon className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="font-semibold text-zinc-900 truncate">{doc.filename}</p>
                                        <Badge variant="outline" className="text-xs capitalize bg-white/50">
                                          {doc.documentType}
                                        </Badge>
                                      </div>
                                      <p className="text-xs text-zinc-500 mt-1">
                                        Added {new Date(doc.updatedAt).toLocaleDateString()} • {doc.summary?.totalEntries || 0} entries
                                      </p>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-2"
                                      onClick={async () => {
                                        await applyLogbook.mutateAsync({
                                          pilotId: selectedPilot._id,
                                          documentId: doc._id,
                                          action: 'remove'
                                        });
                                        const result = await refetch();
                                        if (result.data) {
                                          const updated = result.data.find((p: Pilot) => p._id === selectedPilot._id);
                                          if (updated) setSelectedPilot(updated);
                                        }
                                        refetchDocs();
                                      }}
                                      disabled={applyLogbook.isPending}
                                    >
                                      {applyLogbook.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <div className="text-center py-8 border-2 border-dashed border-zinc-200 rounded-xl bg-zinc-50/50">
                          <FileText className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
                          <p className="text-sm font-medium text-zinc-900">No documents linked</p>
                          <p className="text-xs text-zinc-500 mt-1 max-w-[200px] mx-auto">
                            Link logbooks or maintenance records to include them in calculations
                          </p>
                          <Button variant="outline" size="sm" onClick={() => setShowAddDocModal(true)} className="mt-4">
                            <Plus className="w-4 h-4 mr-2" /> Link Document
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Flight History Table */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-zinc-900 flex items-center">
                        <FileText className="w-4 h-4 mr-2" /> Flight History
                      </h3>

                      {selectedPilot.flightEntries && selectedPilot.flightEntries.length > 0 ? (
                        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-zinc-50 border-b border-zinc-200">
                              <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider">
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Aircraft</th>
                                <th className="px-4 py-3">Route</th>
                                <th className="px-4 py-3 text-right">Total</th>
                                <th className="px-4 py-3 text-right">Night</th>
                                <th className="px-4 py-3 text-right">XC</th>
                                <th className="px-4 py-3">Remarks</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {selectedPilot.flightEntries.slice().reverse().slice(0, 50).map((entry: any, i: number) => (
                                <tr key={i} className="hover:bg-zinc-50">
                                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">{entry.date}</td>
                                  <td className="px-4 py-3">
                                    <span className="font-medium text-zinc-900">{entry.aircraftIdent}</span>
                                    {entry.aircraftType && <span className="text-zinc-500 ml-1">({entry.aircraftType})</span>}
                                  </td>
                                  <td className="px-4 py-3 text-zinc-700">{entry.from} → {entry.to}</td>
                                  <td className="px-4 py-3 text-right font-medium text-zinc-900">{entry.totalTime}</td>
                                  <td className="px-4 py-3 text-right text-zinc-600">{entry.night || '-'}</td>
                                  <td className="px-4 py-3 text-right text-zinc-600">{entry.crossCountry || '-'}</td>
                                  <td className="px-4 py-3 text-xs text-zinc-500 max-w-48 truncate" title={entry.remarks}>{entry.remarks || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {selectedPilot.flightEntries.length > 50 && (
                            <div className="px-4 py-2 bg-zinc-50 border-t border-zinc-200 text-xs text-zinc-500 text-center">
                              Showing latest 50 of {selectedPilot.flightEntries.length} entries
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8 border-2 border-dashed border-zinc-200 rounded-lg">
                          <p className="text-zinc-500">Upload a logbook to populate flight history</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'safety' && (
                  <div className="space-y-8">
                    {/* Header Section */}
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                      <div>
                        <h3 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-indigo-600" />
                          AI Safety Intelligence
                        </h3>
                        <p className="text-zinc-500 mt-1 max-w-2xl">
                          Autonomous analysis of flight patterns, weather exposure, and logbook integrity.
                        </p>
                      </div>

                      {/* Overall Score */}
                      {aiAnalysis && (
                        <div className="flex items-center gap-4 bg-white p-2 pr-6 rounded-full border border-zinc-200 shadow-sm">
                          <div className={cn(
                            "w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white",
                            aiAnalysis.overall_assessment.score >= 7 ? "bg-red-500" :
                              aiAnalysis.overall_assessment.score >= 4 ? "bg-amber-500" : "bg-emerald-500"
                          )}>
                            {aiAnalysis.overall_assessment.score}
                          </div>
                          <div>
                            <div className="text-xs text-zinc-500 uppercase font-bold tracking-wider">Risk Score</div>
                            <div className="text-sm font-medium text-zinc-900">
                              {aiAnalysis.overall_assessment.score >= 7 ? "High Risk" :
                                aiAnalysis.overall_assessment.score >= 4 ? "Moderate Risk" : "Low Risk"}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* AI Analysis Content */}
                    <div className="min-h-[200px]">
                      {analyzingAI && !aiAnalysis ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-24 bg-zinc-100/50 rounded-xl border border-zinc-100 animate-pulse" />
                          ))}
                        </div>
                      ) : aiAnalysis ? (
                        <div className="space-y-6">
                          {/* Summary Box */}
                          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-6">
                            <h4 className="font-semibold text-indigo-900 mb-2">Executive Summary</h4>
                            <p className="text-indigo-800/80 leading-relaxed">
                              {aiAnalysis.overall_assessment.summary}
                            </p>
                          </div>

                          {/* Risk Cards Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {aiAnalysis.risk_factors.map((factor, i) => renderRiskCard(factor, i))}
                          </div>

                          <div className="flex justify-end pt-2">
                            <Button
                              onClick={() => selectedPilot && handleRunAIAnalysis(selectedPilot._id as string)}
                              variant="outline"
                              size="sm"
                              className="text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200"
                            >
                              <RefreshCw className="w-3.5 h-3.5 mr-2" />
                              Re-run Analysis
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-12 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                          <Button onClick={() => selectedPilot && handleRunAIAnalysis(selectedPilot._id as string)}>Run Initial Analysis</Button>
                        </div>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="border-t border-zinc-200 my-8" />

                    {/* Legacy/Deterministic Checks */}
                    <div className="space-y-4 opacity-80 hover:opacity-100 transition-opacity">
                      <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-zinc-500" />
                        Standard Rule Checks
                      </h3>
                      {(() => {
                        const considerations = [];
                        const exp = selectedPilot.experience;
                        const entries = selectedPilot.flightEntries || [];

                        // 1. Currency Check
                        if (exp.last90DaysHours < 3) {
                          considerations.push({
                            level: 'high',
                            title: 'Low Recent Experience',
                            description: `Only ${exp.last90DaysHours} hours in last 90 days. Passenger carrying currency may be invalid.`
                          });
                        }

                        // 2. Total Time / Student Status
                        if (exp.totalHours < 60 && !selectedPilot.certificates?.type?.includes('PPL')) {
                          considerations.push({
                            level: 'medium',
                            title: 'Student Pilot Phase',
                            description: 'Total time under 60 hours. High supervision required.'
                          });
                        }

                        // 3. Night Experience
                        if (exp.totalHours > 50 && (exp.nightHours / exp.totalHours) < 0.05) {
                          considerations.push({
                            level: 'medium',
                            title: 'Low Night Experience',
                            description: `Night flying is only ${Math.round((exp.nightHours / exp.totalHours) * 100)}% of total time. Consideration for night proficiency.`
                          });
                        }

                        // 4. Remarks Analysis
                        const riskKeywords = ['emergency', 'aborted', 'diverted', 'engine rough', 'failure', 'forced landing', 'incident', 'accident'];
                        const riskyFlights = entries.filter(e => e.remarks && riskKeywords.some(k => e.remarks?.toLowerCase().includes(k)));

                        if (riskyFlights.length > 0) {
                          considerations.push({
                            level: 'high',
                            title: 'Recorded Incidents',
                            description: `Found ${riskyFlights.length} flights with risk-related remarks (e.g. "${riskyFlights[0].remarks?.substring(0, 30)}..."). Review logbook carefully.`
                          });
                        }

                        // 5. Geographic/XC Check
                        const xcHours = exp.crossCountryHours || 0;
                        if (exp.totalHours > 50 && xcHours > 0 && xcHours < 10) {
                          considerations.push({
                            level: 'medium',
                            title: 'Limited Cross-Country',
                            description: 'Cross-country time is low relative to total time. Navigation skills review recommended.'
                          });
                        }

                        if (considerations.length === 0) {
                          return (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 mb-2">
                              <div className="flex gap-3">
                                <Shield className="h-5 w-5 text-emerald-600" />
                                <div>
                                  <h3 className="font-semibold text-emerald-900 text-sm">No Risk Factors Detected</h3>
                                  <p className="text-sm text-emerald-800 mt-1">Automated analysis of flight times and remarks shows no standard risk indicators.</p>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                              <Shield className="w-4 h-4" />
                              Safety Considerations
                            </h3>
                            <div className="grid gap-3">
                              {considerations.map((c, i) => (
                                <div key={i} className={cn(
                                  "p-4 rounded-lg border flex gap-3",
                                  c.level === 'high' ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
                                )}>
                                  <AlertTriangle className={cn("h-5 w-5 flex-shrink-0", c.level === 'high' ? "text-red-600" : "text-amber-600")} />
                                  <div>
                                    <h4 className={cn("font-semibold text-sm", c.level === 'high' ? "text-red-900" : "text-amber-900")}>{c.title}</h4>
                                    <p className={cn("text-sm mt-1", c.level === 'high' ? "text-red-800" : "text-amber-800")}>{c.description}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <div className="flex gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        <div>
                          <h3 className="font-semibold text-amber-900 text-sm">NTSB Database Check</h3>
                          <p className="text-sm text-amber-800 mt-1">Scanning for accidents/incidents matching pilot name "{selectedPilot.name}".</p>
                        </div>
                      </div>
                    </div>

                    {loadingSafety ? (
                      <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div></div>
                    ) : safetyData?.reports && safetyData.reports.length > 0 ? (
                      <div className="space-y-3">
                        {safetyData.reports.map((report, idx) => (
                          <div key={idx} className="p-4 bg-white border border-zinc-200 rounded-lg shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <span className="font-mono text-xs font-semibold text-zinc-500">{report.EventDate || 'Unknown Date'}</span>
                                <span className="text-xs text-zinc-400 mx-2">•</span>
                                <span className="text-xs font-medium text-zinc-600">{report.Location}</span>
                                <h4 className="font-medium text-zinc-900 mt-1">{report.MakeModel || report['Aircraft Make/Model']}</h4>
                              </div>
                              <Badge variant={String(report.Severity).includes('Fatal') ? 'destructive' : 'warning'}>{report.Severity}</Badge>
                            </div>
                            <p className="text-sm text-zinc-600 line-clamp-2">{report.BriefDescription || report['Brief Description']}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12 border-2 border-dashed border-zinc-200 rounded-lg">
                        <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                        <h3 className="font-medium text-zinc-900">Clean Record Found</h3>
                        <p className="text-sm text-zinc-500 mt-1">No NTSB reports found for this pilot.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-zinc-50/50">
              <div className="w-16 h-16 bg-white border border-zinc-200 rounded-full flex items-center justify-center shadow-sm mb-4">
                <User className="w-8 h-8 text-zinc-300" />
              </div>
              <h3 className="text-lg font-medium text-zinc-900">No Pilot Selected</h3>
              <p className="text-zinc-500 max-w-xs mx-auto mt-2">Select a pilot to view logbook, certifications, and safety analysis.</p>
            </div>
          )}
        </div>
      </div>

      {showAddModal && <AddPilotModal onClose={() => setShowAddModal(false)} onCreate={(data) => createPilot.mutate(data, { onSuccess: () => setShowAddModal(false) })} isLoading={createPilot.isPending} />}
      {showPlanFlightModal && selectedPilot && aircraft && <PlanFlightModal onClose={() => setShowPlanFlightModal(false)} pilot={selectedPilot} aircraft={aircraft} onSubmit={(data) => createFlight.mutate(data, { onSuccess: () => setShowPlanFlightModal(false) })} isLoading={createFlight.isPending} />}
      {showDeleteModal && selectedPilot && <DeleteConfirmModal pilot={selectedPilot} onClose={() => setShowDeleteModal(false)} onDelete={() => deletePilot.mutate(selectedPilot._id, { onSuccess: () => { setShowDeleteModal(false); setSelectedPilot(null); } })} isLoading={deletePilot.isPending} />}

      {/* Add Document Modal */}
      {
        showAddDocModal && selectedPilot && (
          <AddDocumentModal
            pilot={selectedPilot}
            onClose={() => setShowAddDocModal(false)}
            onPilotUpdate={async () => {
              const res = await refetch();
              if (res.data) {
                const updated = res.data.find((p: Pilot) => p._id === selectedPilot._id);
                if (updated) setSelectedPilot(updated);
              }
            }}
          />
        )
      }
    </div >
  );
}

function CurrencyItem({ label, expiration }: { label: string; expiration: Date | string }) {
  const daysLeft = Math.ceil((new Date(expiration).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  const status = daysLeft < 0 ? 'expired' : daysLeft < 30 ? 'warning' : 'valid';

  return (
    <div className="p-4 bg-white rounded-lg border border-zinc-200 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === 'valid' ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
          <span className="text-sm font-medium text-zinc-900">{label}</span>
        </div>
        <Badge variant={status === 'valid' ? 'secondary' : status === 'warning' ? 'warning' : 'destructive'} className="text-xs">
          {daysLeft < 0 ? 'Expired' : `${daysLeft}d left`}
        </Badge>
      </div>
      <p className="text-xs text-zinc-500 mt-1 ml-6">{new Date(expiration).toLocaleDateString()}</p>
    </div>
  );
}

function AddPilotModal({ onClose, onCreate, isLoading }: { onClose: () => void; onCreate: (data: any) => void; isLoading: boolean }) {
  const [formData, setFormData] = useState({
    name: '', email: '',
    certificates: { type: 'PPL', instrumentRated: false, multiEngineRated: false },
    experience: { totalHours: 0, picHours: 0, nightHours: 0, ifrHours: 0, last90DaysHours: 0, last30DaysHours: 0 },
    medicalExpiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    flightReviewExpiration: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-zinc-200 flex justify-between items-center bg-zinc-50 rounded-t-xl">
          <h2 className="text-lg font-bold text-zinc-900">Add Pilot</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onCreate(formData); }} className="p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-900">Core Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium text-zinc-700">Name</label><input required className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
              <div><label className="text-sm font-medium text-zinc-700">Email</label><input type="email" required className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} /></div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-900">Certification</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium text-zinc-700">Certificate</label>
                <select className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg bg-white" value={formData.certificates.type} onChange={e => setFormData({ ...formData, certificates: { ...formData.certificates, type: e.target.value } })}>
                  <option value="Student">Student Pilot</option><option value="PPL">Private (PPL)</option><option value="CPL">Commercial (CPL)</option><option value="ATP">ATP</option>
                </select>
              </div>
              <div className="flex gap-4 pt-8">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" checked={formData.certificates.instrumentRated} onChange={e => setFormData({ ...formData, certificates: { ...formData.certificates, instrumentRated: e.target.checked } })} /><span className="text-sm text-zinc-700">Instrument</span></label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" checked={formData.certificates.multiEngineRated} onChange={e => setFormData({ ...formData, certificates: { ...formData.certificates, multiEngineRated: e.target.checked } })} /><span className="text-sm text-zinc-700">Multi-Engine</span></label>
              </div>
            </div>
          </div>

          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-zinc-900">Initial Experience</h3>
              <span className="text-xs text-zinc-500">Approximate hours</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className="text-xs text-zinc-500 font-medium">TOTAL</label><input type="number" className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-lg" value={formData.experience.totalHours} onChange={e => setFormData({ ...formData, experience: { ...formData.experience, totalHours: parseFloat(e.target.value) } })} /></div>
              <div><label className="text-xs text-zinc-500 font-medium">PIC</label><input type="number" className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-lg" value={formData.experience.picHours} onChange={e => setFormData({ ...formData, experience: { ...formData.experience, picHours: parseFloat(e.target.value) } })} /></div>
              <div><label className="text-xs text-zinc-500 font-medium">NIGHT</label><input type="number" className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-lg" value={formData.experience.nightHours} onChange={e => setFormData({ ...formData, experience: { ...formData.experience, nightHours: parseFloat(e.target.value) } })} /></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-sm font-medium text-zinc-700">Medical Expires</label><input type="date" required className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg" value={formData.medicalExpiration} onChange={e => setFormData({ ...formData, medicalExpiration: e.target.value })} /></div>
            <div><label className="text-sm font-medium text-zinc-700">Flight Review Due</label><input type="date" required className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg" value={formData.flightReviewExpiration} onChange={e => setFormData({ ...formData, flightReviewExpiration: e.target.value })} /></div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-zinc-100">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>{isLoading ? 'Adding...' : 'Create Pilot'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PlanFlightModal({ onClose, pilot, aircraft, onSubmit, isLoading }: { onClose: () => void; pilot: Pilot; aircraft: Aircraft[]; onSubmit: (data: any) => void; isLoading: boolean }) {
  const [formData, setFormData] = useState({ pilot: pilot._id, aircraft: aircraft[0]?._id || '', scheduledDate: new Date().toISOString().slice(0, 16), departureAirport: '', arrivalAirport: '' });

  const getDaysUntil = (date: Date | string) => Math.ceil((new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  const isPilotIssue = getDaysUntil(pilot.medicalExpiration) < 0 || getDaysUntil(pilot.flightReviewExpiration) < 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="p-6 border-b border-zinc-200 flex justify-between items-center bg-zinc-50 rounded-t-xl"><h2 className="text-lg font-bold">Plan Flight</h2><Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button></div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }} className="p-6 space-y-5">

          <div>
            <label className="text-sm font-medium text-zinc-700">Pilot</label>
            <select disabled className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg bg-zinc-100 text-zinc-500">
              <option>{isPilotIssue ? '⚠️ ' : ''}{pilot.name} {isPilotIssue ? '(Issues Found)' : ''}</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Aircraft</label>
            <select required className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg bg-white" value={formData.aircraft} onChange={e => setFormData({ ...formData, aircraft: e.target.value })}>
              {aircraft.map(ac => {
                const annualExp = getDaysUntil(ac.maintenanceDates.annual) < 0;
                const transponderExp = getDaysUntil(ac.maintenanceDates.transponder) < 0;
                const issue = annualExp || transponderExp;
                return (
                  <option key={ac._id} value={ac._id}>
                    {issue ? '⚠️ ' : '✈️ '} {ac.tailNumber} - {ac.model} {issue ? '(Maintenance Due)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Date & Time</label>
            <input type="datetime-local" required className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg" value={formData.scheduledDate} onChange={e => setFormData({ ...formData, scheduledDate: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-sm font-medium text-zinc-700">Departure</label><input required placeholder="KJFK" className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg uppercase" value={formData.departureAirport} onChange={e => setFormData({ ...formData, departureAirport: e.target.value.toUpperCase() })} /></div>
            <div><label className="text-sm font-medium text-zinc-700">Arrival</label><input placeholder="Local" className="w-full mt-1.5 px-3 py-2 border border-zinc-300 rounded-lg uppercase" value={formData.arrivalAirport} onChange={e => setFormData({ ...formData, arrivalAirport: e.target.value.toUpperCase() })} /></div>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-zinc-100">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>{isLoading ? 'Creating...' : 'Create Flight'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ pilot, onClose, onDelete, isLoading }: { pilot: Pilot; onClose: () => void; onDelete: () => void; isLoading: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center gap-3 text-red-600 mb-4"><div className="bg-red-50 p-2 rounded-full"><AlertTriangle className="w-6 h-6" /></div><h3 className="text-lg font-bold text-zinc-900">Remove Pilot?</h3></div>
        <p className="text-zinc-600 mb-6 text-sm">Are you sure you want to remove <strong>{pilot.name}</strong>?</p>
        <div className="flex justify-end gap-3"><Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button><Button variant="destructive" onClick={onDelete} disabled={isLoading}>{isLoading ? 'Removing...' : 'Remove Pilot'}</Button></div>
      </div>
    </div>
  );
}

function DeletePilotModal({ pilot, isOpen, onClose, onDelete, isLoading }: { pilot: Pilot, isOpen: boolean, onClose: () => void, onDelete: () => void, isLoading: boolean }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
        <div className="flex items-center gap-3 text-red-600 mb-4"><div className="bg-red-50 p-2 rounded-full"><AlertTriangle className="w-6 h-6" /></div><h3 className="text-lg font-bold text-zinc-900">Remove Pilot?</h3></div>
        <p className="text-zinc-600 mb-6 text-sm">Are you sure you want to remove <strong>{pilot.name}</strong>?</p>
        <div className="flex justify-end gap-3"><Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button><Button variant="destructive" onClick={onDelete} disabled={isLoading}>{isLoading ? 'Removing...' : 'Remove Pilot'}</Button></div>
      </div>
    </div>
  );
}

function AddDocumentModal({ pilot, onClose, onPilotUpdate }: { pilot: Pilot; onClose: () => void; onPilotUpdate: () => void }) {
  const [activeTab, setActiveTab] = useState<'link' | 'upload'>('link');
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const { data: parsedDocs = [], refetch: refetchDocs } = useParsedDocuments();
  const applyLogbook = useApplyLogbook();
  const parseDocument = useParseDocument();
  const { data: aircraft } = useAircraft();

  // Upload State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [updateAircraft, setUpdateAircraft] = useState(false);
  const [selectedAircraftId, setSelectedAircraftId] = useState('');
  const [addHours, setAddHours] = useState(0);

  const handleUpload = async () => {
    if (!uploadFile) return;

    parseDocument.mutate({
      fileBase64: await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
        reader.readAsDataURL(uploadFile);
      }),
      fileType: uploadFile.type.includes('pdf') ? 'pdf' : 'image',
      documentType: 'logbook',
      filename: uploadFile.name,
      pilotId: pilot._id, // Auto-link
      background: true
    }, {
      onSuccess: async () => {
        if (updateAircraft && selectedAircraftId && addHours > 0 && aircraft) {
          const ac = aircraft.find(a => a._id === selectedAircraftId);
          if (ac) {
            const newHobbs = (ac.currentHours.hobbs || 0) + addHours;
            const newTach = (ac.currentHours.tach || 0) + addHours;
            // Client-side PUT
            try {
              await fetch(`/api/aircraft/${selectedAircraftId}`, {
                method: 'PUT',
                body: JSON.stringify({ currentHours: { hobbs: newHobbs, tach: newTach } })
              });
            } catch (e) { console.error("Failed to update aircraft", e); }
          }
        }
        refetchDocs();
        onPilotUpdate();
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-zinc-200 max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Add Document</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
        </div>

        <div className="flex border-b border-zinc-100">
          <button onClick={() => setActiveTab('link')} className={cn("flex-1 py-3 text-sm font-medium transition-colors", activeTab === 'link' ? "text-blue-600 border-b-2 border-blue-600" : "text-zinc-500 hover:text-zinc-700")}>Link Existing</button>
          <button onClick={() => setActiveTab('upload')} className={cn("flex-1 py-3 text-sm font-medium transition-colors", activeTab === 'upload' ? "text-blue-600 border-b-2 border-blue-600" : "text-zinc-500 hover:text-zinc-700")}>Upload New</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'link' ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input type="text" placeholder="Search available files..." value={docSearchQuery} onChange={(e) => setDocSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-2">
                {parsedDocs
                  .filter((d: any) => d.status === 'completed' && !pilot.linkedDocuments?.includes(d._id))
                  .filter((d: any) => !docSearchQuery || d.filename?.toLowerCase().includes(docSearchQuery.toLowerCase()))
                  .map((doc: any) => {
                    const isLogbook = doc.documentType === 'logbook';
                    const Icon = isLogbook ? Book : Wrench;
                    return (
                      <div key={doc._id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn("w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0", isLogbook ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600")}><Icon className="w-4 h-4" /></div>
                          <div className="min-w-0"><p className="font-medium text-sm text-zinc-900 truncate">{doc.filename}</p><p className="text-xs text-zinc-500">{doc.summary?.totalEntries || 0} entries • {new Date(doc.updatedAt).toLocaleDateString()}</p></div>
                        </div>
                        <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={async () => { await applyLogbook.mutateAsync({ pilotId: pilot._id, documentId: doc._id, action: 'add' }); onPilotUpdate(); refetchDocs(); }} disabled={applyLogbook.isPending}>
                          {applyLogbook.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        </Button>
                      </div>
                    );
                  })}
                {parsedDocs.filter((d: any) => d.status === 'completed' && !pilot.linkedDocuments?.includes(d._id)).length === 0 && (
                  <div className="text-center py-8 text-zinc-500"><CheckCircle className="w-8 h-8 mx-auto text-zinc-300 mb-2" /><p>No available documents found</p></div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-zinc-300 rounded-xl p-6 text-center hover:border-blue-400 transition-colors bg-zinc-50/50">
                <input type="file" accept="application/pdf,image/*" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="hidden" id="modal-upload" />
                <label htmlFor="modal-upload" className="cursor-pointer">
                  {uploadFile ? (
                    <div className="flex flex-col items-center"><FileText className="w-10 h-10 text-blue-500 mb-2" /><p className="font-medium text-zinc-900">{uploadFile.name}</p><p className="text-xs text-zinc-500">Tap to change</p></div>
                  ) : (
                    <div className="flex flex-col items-center"><Upload className="w-10 h-10 text-zinc-300 mb-2" /><p className="font-medium text-zinc-900">Choose File</p><p className="text-xs text-zinc-500">PDF or Image</p></div>
                  )}
                </label>
              </div>

              <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200">
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input type="checkbox" checked={updateAircraft} onChange={e => setUpdateAircraft(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                  <span className="text-sm font-medium text-zinc-900">Update Aircraft Hours?</span>
                </label>

                {updateAircraft && (
                  <div className="space-y-3 pl-6 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div>
                      <label className="text-xs text-zinc-500 uppercase font-bold">Aircraft to Update</label>
                      <select className="w-full mt-1 text-sm border-zinc-300 rounded-md" value={selectedAircraftId} onChange={e => setSelectedAircraftId(e.target.value)}>
                        <option value="">Select Aircraft...</option>
                        {aircraft?.map(ac => <option key={ac._id} value={ac._id}>{ac.tailNumber} - {ac.model}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 uppercase font-bold">Hours Flown (to add)</label>
                      <input type="number" step="0.1" className="w-full mt-1 text-sm border-zinc-300 rounded-md" value={addHours} onChange={e => setAddHours(parseFloat(e.target.value))} />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button onClick={handleUpload} disabled={!uploadFile || parseDocument.isPending || (updateAircraft && (!selectedAircraftId || addHours <= 0))}>
                  {parseDocument.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                  {parseDocument.isPending ? 'Processing...' : 'Upload & Process'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
