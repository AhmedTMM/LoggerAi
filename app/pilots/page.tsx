'use client';

import { useState, useEffect } from 'react';
import { User, Plus, Clock, AlertTriangle, CheckCircle, Trash2, RefreshCw, Shield, Award, Mail, Save, FileText, ChevronDown, ChevronUp, Pencil, X, Check, Plane, Cloud, Wind, Eye, Thermometer, Navigation, MapPin } from 'lucide-react';
import { usePilots, useCreatePilot, useDeletePilot, useParsedDocuments, useGeneratePilotSafetyAnalysis, useFlightsByPilot } from '@/lib/hooks';
import type { Pilot, Flight, WeatherData } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSkeleton';
import { cn, getDaysUntil } from '@/lib/utils';

export default function PilotsPage() {
  const { data: pilots, isLoading, error, refetch } = usePilots();
  const createPilot = useCreatePilot();
  const deletePilot = useDeletePilot();
  const generateSafetyAnalysis = useGeneratePilotSafetyAnalysis();

  const [selectedPilot, setSelectedPilot] = useState<Pilot | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingEmail, setEditingEmail] = useState('');
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);

  // Editing states for name, medical, and flight review
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingMedical, setEditingMedical] = useState<string | null>(null);
  const [editingFlightReview, setEditingFlightReview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Auto-generate safety analysis when pilot is selected without one
  useEffect(() => {
    if (selectedPilot && !selectedPilot.safetyAnalysis && !isGeneratingAnalysis) {
      setIsGeneratingAnalysis(true);
      generateSafetyAnalysis.mutate(selectedPilot._id, {
        onSuccess: () => {
          refetch();
          setIsGeneratingAnalysis(false);
        },
        onError: () => {
          setIsGeneratingAnalysis(false);
        },
      });
    }
  }, [selectedPilot?._id, selectedPilot?.safetyAnalysis]);

  const handleSaveEmail = async () => {
    if (!selectedPilot) return;
    setIsSavingEmail(true);
    try {
      const res = await fetch(`/api/pilots/${selectedPilot._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: editingEmail }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedPilot({ ...selectedPilot, email: editingEmail });
        refetch();
      } else {
        alert('Failed to save email: ' + data.error);
      }
    } catch (err) {
      alert('Error saving email');
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleSaveField = async (field: 'name' | 'medicalExpiration' | 'flightReviewExpiration', value: string) => {
    if (!selectedPilot) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/pilots/${selectedPilot._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedPilot({ ...selectedPilot, [field]: value } as Pilot);
        refetch();
        // Reset editing states
        setEditingName(null);
        setEditingMedical(null);
        setEditingFlightReview(null);
      } else {
        alert('Failed to save: ' + data.error);
      }
    } catch (err) {
      alert('Error saving');
    } finally {
      setIsSaving(false);
    }
  };

  const getCertBadge = (type: string) => {
    switch (type) {
      case 'ATP': return <Badge variant="success">ATP</Badge>;
      case 'CPL': return <Badge variant="default">Commercial</Badge>;
      case 'PPL': return <Badge variant="secondary">Private</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getExpirationStatus = (date: Date | string) => {
    const days = getDaysUntil(date);
    if (days < 0) return { color: 'text-red-500', badge: 'destructive', text: 'Expired' };
    if (days < 30) return { color: 'text-amber-500', badge: 'warning', text: `${days}d left` };
    return { color: 'text-emerald-500', badge: 'success', text: 'Current' };
  };

  if (isLoading) return <LoadingSpinner className="h-96" />;
  if (error) return (
    <div className="text-center py-12">
      <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
      <p className="text-zinc-600">Failed to load pilots</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Pilots</h1>
          <p className="text-zinc-500">Manage your pilot roster</p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Pilot
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-sm text-zinc-500">Total Pilots</p>
          <p className="text-2xl font-bold text-zinc-900">{pilots?.length || 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-sm text-zinc-500">Instrument Rated</p>
          <p className="text-2xl font-bold text-zinc-900">
            {pilots?.filter(p => p.certificates?.instrumentRated).length || 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-sm text-zinc-500">Expiring Soon</p>
          <p className="text-2xl font-bold text-amber-500">
            {pilots?.filter(p => getDaysUntil(p.medicalExpiration) < 30 && getDaysUntil(p.medicalExpiration) >= 0).length || 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-sm text-zinc-500">Expired</p>
          <p className="text-2xl font-bold text-red-500">
            {pilots?.filter(p => getDaysUntil(p.medicalExpiration) < 0).length || 0}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pilot List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="p-3 border-b border-zinc-200 bg-zinc-50">
              <h3 className="font-semibold text-zinc-900">Pilot Roster</h3>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {pilots?.map((pilot) => {
                const isSelected = selectedPilot?._id === pilot._id;
                const medicalStatus = getExpirationStatus(pilot.medicalExpiration);

                return (
                  <div
                    key={pilot._id}
                    onClick={() => {
                      setSelectedPilot(pilot);
                      setEditingEmail((pilot as any).email || '');
                    }}
                    className={cn(
                      "p-4 border-b border-zinc-100 cursor-pointer transition-colors",
                      isSelected
                        ? "bg-blue-50"
                        : "hover:bg-zinc-50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-zinc-900">{pilot.name}</span>
                      {getCertBadge(pilot.certificates?.type || 'PPL')}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-zinc-500">
                      <span>{pilot.experience?.totalHours || 0} hours</span>
                      <span className={medicalStatus.color}>Medical: {medicalStatus.text}</span>
                    </div>
                  </div>
                );
              })}
              {(!pilots || pilots.length === 0) && (
                <div className="p-8 text-center">
                  <User className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                  <p className="text-zinc-500">No pilots added yet</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Pilot
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pilot Details */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-zinc-200 min-h-[500px]">
            {selectedPilot ? (
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-zinc-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-zinc-100 rounded-full flex items-center justify-center">
                        <User className="w-7 h-7 text-zinc-500" />
                      </div>
                      <div>
                        {/* Editable Name */}
                        {editingName !== null ? (
                          <div className="flex items-center gap-2 mb-1">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="text-xl font-bold px-2 py-1 border border-zinc-300 rounded bg-white text-zinc-900"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveField('name', editingName)}
                              disabled={isSaving}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => setEditingName(null)}
                              className="p-1 text-zinc-400 hover:bg-zinc-100 rounded"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group mb-1">
                            <h2 className="text-xl font-bold text-zinc-900">{selectedPilot.name}</h2>
                            <button
                              onClick={() => setEditingName(selectedPilot.name)}
                              className="p-1 text-zinc-400 hover:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {getCertBadge(selectedPilot.certificates?.type || 'PPL')}
                          {selectedPilot.certificates?.instrumentRated && (
                            <Badge variant="outline">Instrument Rated</Badge>
                          )}
                        </div>
                        {/* Email Field */}
                        <div className="flex items-center gap-2 mt-2">
                          <Mail className="w-4 h-4 text-zinc-400" />
                          <input
                            type="email"
                            value={editingEmail}
                            onChange={(e) => setEditingEmail(e.target.value)}
                            placeholder="pilot@email.com"
                            className="flex-1 px-2 py-1 text-sm border border-zinc-300 rounded bg-white text-zinc-900"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleSaveEmail}
                            disabled={isSavingEmail}
                          >
                            {isSavingEmail ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Save className="w-3 h-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDeleteModal(true)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                  {/* Experience */}
                  <div>
                    <h4 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                      <Award className="w-4 h-4" /> Experience
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-zinc-50 rounded-lg p-3">
                        <p className="text-xs text-zinc-500">Total Hours</p>
                        <p className="text-lg font-bold text-zinc-900">{selectedPilot.experience?.totalHours || 0}</p>
                      </div>
                      <div className="bg-zinc-50 rounded-lg p-3">
                        <p className="text-xs text-zinc-500">Night Hours</p>
                        <p className="text-lg font-bold text-zinc-900">{selectedPilot.experience?.nightHours || 0}</p>
                      </div>
                      <div className="bg-zinc-50 rounded-lg p-3">
                        <p className="text-xs text-zinc-500">IFR Hours</p>
                        <p className="text-lg font-bold text-zinc-900">{selectedPilot.experience?.ifrHours || 0}</p>
                      </div>
                      <div className="bg-zinc-50 rounded-lg p-3">
                        <p className="text-xs text-zinc-500">PIC Hours</p>
                        <p className="text-lg font-bold text-zinc-900">{selectedPilot.experience?.picHours || 0}</p>
                      </div>
                    </div>
                  </div>

                  {/* Currency */}
                  <div>
                    <h4 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Currency Status
                    </h4>
                    <div className="space-y-3">
                      {/* Medical */}
                      <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg group">
                        <span className="text-zinc-700">Medical</span>
                        <div className="flex items-center gap-2">
                          {editingMedical !== null ? (
                            <>
                              <input
                                type="date"
                                value={editingMedical}
                                onChange={(e) => setEditingMedical(e.target.value)}
                                className="px-2 py-1 text-sm border border-zinc-300 rounded bg-white text-zinc-900"
                              />
                              <button
                                onClick={() => handleSaveField('medicalExpiration', editingMedical)}
                                disabled={isSaving}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditingMedical(null)}
                                className="p-1 text-zinc-400 hover:bg-zinc-100 rounded"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-sm text-zinc-500">
                                {new Date(selectedPilot.medicalExpiration).toLocaleDateString()}
                              </span>
                              <Badge variant={getExpirationStatus(selectedPilot.medicalExpiration).badge as any}>
                                {getExpirationStatus(selectedPilot.medicalExpiration).text}
                              </Badge>
                              <button
                                onClick={() => setEditingMedical(new Date(selectedPilot.medicalExpiration).toISOString().split('T')[0])}
                                className="p-1 text-zinc-400 hover:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Flight Review */}
                      <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg group">
                        <span className="text-zinc-700">Flight Review</span>
                        <div className="flex items-center gap-2">
                          {editingFlightReview !== null ? (
                            <>
                              <input
                                type="date"
                                value={editingFlightReview}
                                onChange={(e) => setEditingFlightReview(e.target.value)}
                                className="px-2 py-1 text-sm border border-zinc-300 rounded bg-white text-zinc-900"
                              />
                              <button
                                onClick={() => handleSaveField('flightReviewExpiration', editingFlightReview)}
                                disabled={isSaving}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditingFlightReview(null)}
                                className="p-1 text-zinc-400 hover:bg-zinc-100 rounded"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-sm text-zinc-500">
                                {new Date(selectedPilot.flightReviewExpiration).toLocaleDateString()}
                              </span>
                              <Badge variant={getExpirationStatus(selectedPilot.flightReviewExpiration).badge as any}>
                                {getExpirationStatus(selectedPilot.flightReviewExpiration).text}
                              </Badge>
                              <button
                                onClick={() => setEditingFlightReview(new Date(selectedPilot.flightReviewExpiration).toISOString().split('T')[0])}
                                className="p-1 text-zinc-400 hover:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Safety Analysis */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-zinc-900 flex items-center gap-2">
                        <Shield className="w-4 h-4" /> Safety Analysis
                      </h4>
                      {selectedPilot.safetyAnalysis && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setIsGeneratingAnalysis(true);
                            generateSafetyAnalysis.mutate(selectedPilot._id, {
                              onSuccess: () => {
                                refetch();
                                setIsGeneratingAnalysis(false);
                              },
                              onError: () => setIsGeneratingAnalysis(false),
                            });
                          }}
                          disabled={isGeneratingAnalysis}
                          className="text-xs"
                        >
                          {isGeneratingAnalysis ? (
                            <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                          ) : (
                            <RefreshCw className="w-3 h-3 mr-1" />
                          )}
                          Regenerate
                        </Button>
                      )}
                    </div>
                    {isGeneratingAnalysis ? (
                      <div className="bg-zinc-50 rounded-lg p-4 text-center">
                        <RefreshCw className="w-8 h-8 text-blue-500 mx-auto mb-2 animate-spin" />
                        <p className="text-sm text-zinc-500">
                          Generating safety analysis...
                        </p>
                      </div>
                    ) : selectedPilot.safetyAnalysis ? (
                      <div className="bg-zinc-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-zinc-600">Risk Score</span>
                          <Badge variant={
                            selectedPilot.safetyAnalysis.score > 7 ? 'success' :
                            selectedPilot.safetyAnalysis.score > 4 ? 'warning' : 'destructive'
                          }>
                            {selectedPilot.safetyAnalysis.score}/10
                          </Badge>
                        </div>
                        {selectedPilot.safetyAnalysis.findings?.map((finding: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-2 text-sm mt-2">
                            {finding.riskLevel === 'low' ? (
                              <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5" />
                            ) : (
                              <AlertTriangle className={cn("w-4 h-4 mt-0.5", finding.riskLevel === 'high' ? 'text-red-500' : 'text-amber-500')} />
                            )}
                            <div className="flex-1">
                              <span className="text-xs text-zinc-500 uppercase">{finding.category}</span>
                              <p className="text-zinc-600">{finding.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-zinc-50 rounded-lg p-4 text-center">
                        <Shield className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                        <p className="text-sm text-zinc-500">
                          No safety analysis available
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => {
                            setIsGeneratingAnalysis(true);
                            generateSafetyAnalysis.mutate(selectedPilot._id, {
                              onSuccess: () => {
                                refetch();
                                setIsGeneratingAnalysis(false);
                              },
                              onError: () => setIsGeneratingAnalysis(false),
                            });
                          }}
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          Generate Analysis
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Linked Documents */}
                  <PilotLinkedDocumentsSection pilotId={selectedPilot._id} />

                  {/* Flight History with Weather */}
                  <PilotFlightHistorySection pilotId={selectedPilot._id} pilotName={selectedPilot.name} />
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <User className="w-12 h-12 text-zinc-300 mb-4" />
                <h3 className="text-lg font-medium text-zinc-900">No Pilot Selected</h3>
                <p className="text-zinc-500 mt-2">Select a pilot to view their details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Pilot Modal */}
      {showAddModal && (
        <AddPilotModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            refetch();
          }}
          createPilot={createPilot}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedPilot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-zinc-900 mb-2">Delete Pilot?</h3>
            <p className="text-zinc-600 mb-6">
              Are you sure you want to delete {selectedPilot.name}? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  deletePilot.mutate(selectedPilot._id as string, {
                    onSuccess: () => {
                      setShowDeleteModal(false);
                      setSelectedPilot(null);
                      refetch();
                    }
                  });
                }}
                disabled={deletePilot.isPending}
                className="flex-1"
              >
                {deletePilot.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PilotLinkedDocumentsSection({ pilotId }: { pilotId: string }) {
  const { data: documents, isLoading } = useParsedDocuments({ pilotId });
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-4 bg-zinc-50 rounded-lg text-center">
        <RefreshCw className="w-6 h-6 text-zinc-400 mx-auto animate-spin" />
      </div>
    );
  }

  const linkedDocs = documents?.filter((doc: any) => doc.status === 'completed') || [];

  return (
    <div>
      <h4 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
        <FileText className="w-4 h-4" /> Linked Documents
        {linkedDocs.length > 0 && (
          <Badge variant="secondary" className="text-xs">{linkedDocs.length}</Badge>
        )}
      </h4>
      {linkedDocs.length > 0 ? (
        <div className="space-y-2">
          {linkedDocs.map((doc: any) => {
            const isExpanded = expandedDoc === doc._id;
            const entries = doc.entries || [];

            return (
              <div
                key={doc._id}
                className="bg-zinc-50 rounded-lg border border-zinc-200 overflow-hidden"
              >
                {/* Document Header */}
                <div
                  className="p-3 cursor-pointer hover:bg-zinc-100 transition-colors"
                  onClick={() => setExpandedDoc(isExpanded ? null : doc._id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium text-zinc-900 truncate max-w-[200px]">
                        {doc.originalFilename || doc.filename}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {entries.length} entries
                      </Badge>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                    <span>{doc.documentType?.replace(/_/g, ' ')}</span>
                    {doc.summary?.totalHours && (
                      <span>{doc.summary.totalHours.toFixed(1)} total hours</span>
                    )}
                    {doc.summary?.dateRange && (
                      <span>
                        {doc.summary.dateRange.from} - {doc.summary.dateRange.to}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded Flight Entries */}
                {isExpanded && entries.length > 0 && (
                  <div className="border-t border-zinc-200 max-h-72 overflow-y-auto">
                    {entries.slice(0, 50).map((entry: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 border-b border-zinc-100 last:border-b-0"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-zinc-700">
                            {entry.date || 'No date'}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-zinc-500">
                            {entry.totalTime > 0 && (
                              <span className="font-medium">{entry.totalTime}h</span>
                            )}
                            {entry.pic > 0 && <span>PIC: {entry.pic}</span>}
                            {entry.night > 0 && <span>Night: {entry.night}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-zinc-600">
                          {entry.aircraftIdent && (
                            <span className="font-medium text-blue-600">
                              {entry.aircraftIdent}
                            </span>
                          )}
                          {(entry.from || entry.to) && (
                            <span>
                              {entry.from || '?'} → {entry.to || '?'}
                            </span>
                          )}
                        </div>
                        {entry.remarks && (
                          <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                            {entry.remarks}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400">
                          {entry.landingsDay > 0 && <span>Day: {entry.landingsDay}</span>}
                          {entry.landingsNight > 0 && <span>Night: {entry.landingsNight}</span>}
                          {entry.crossCountry > 0 && <span>XC: {entry.crossCountry}h</span>}
                          {entry.actualInstrument > 0 && <span>Actual: {entry.actualInstrument}h</span>}
                          {entry.simulatedInstrument > 0 && <span>Sim: {entry.simulatedInstrument}h</span>}
                        </div>
                      </div>
                    ))}
                    {entries.length > 50 && (
                      <p className="text-xs text-center text-zinc-500 py-2">
                        Showing 50 of {entries.length} entries
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4 bg-zinc-50 rounded-lg text-center">
          <FileText className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">
            No linked documents
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            Upload pilot logbooks from the Files page and link them to this pilot
          </p>
        </div>
      )}
    </div>
  );
}

function PilotFlightHistorySection({ pilotId, pilotName }: { pilotId: string; pilotName: string }) {
  const { data: flights, isLoading } = useFlightsByPilot(pilotId);
  const [expandedFlight, setExpandedFlight] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'vfr' | 'mvfr' | 'ifr'>('all');

  if (isLoading) {
    return (
      <div className="p-4 bg-zinc-50 rounded-lg text-center">
        <RefreshCw className="w-6 h-6 text-zinc-400 mx-auto animate-spin" />
        <p className="text-sm text-zinc-500 mt-2">Loading flight history...</p>
      </div>
    );
  }

  // Filter flights based on active tab
  const filteredFlights = flights?.filter((flight: Flight) => {
    if (activeTab === 'all') return true;
    const category = flight.weather?.flightCategory?.toUpperCase();
    if (activeTab === 'vfr') return category === 'VFR';
    if (activeTab === 'mvfr') return category === 'MVFR';
    if (activeTab === 'ifr') return category === 'IFR' || category === 'LIFR';
    return true;
  }) || [];

  // Calculate weather stats for analysis
  const weatherStats = {
    total: flights?.length || 0,
    vfr: flights?.filter((f: Flight) => f.weather?.flightCategory === 'VFR').length || 0,
    mvfr: flights?.filter((f: Flight) => f.weather?.flightCategory === 'MVFR').length || 0,
    ifr: flights?.filter((f: Flight) => f.weather?.flightCategory === 'IFR' || f.weather?.flightCategory === 'LIFR').length || 0,
  };

  const getFlightCategoryColor = (category?: string) => {
    switch (category?.toUpperCase()) {
      case 'VFR': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'MVFR': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'IFR': return 'bg-red-100 text-red-700 border-red-200';
      case 'LIFR': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-zinc-100 text-zinc-700 border-zinc-200';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'go': return 'success';
      case 'caution': return 'warning';
      case 'no-go': return 'destructive';
      default: return 'secondary';
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (time?: string) => {
    if (!time) return '';
    return time;
  };

  return (
    <div>
      <h4 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
        <Plane className="w-4 h-4" /> Flight History & Weather Analysis
        {flights && flights.length > 0 && (
          <Badge variant="secondary" className="text-xs">{flights.length} flights</Badge>
        )}
      </h4>

      {flights && flights.length > 0 ? (
        <>
          {/* Weather Summary Stats */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                "p-2 rounded-lg text-center transition-all border",
                activeTab === 'all'
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
              )}
            >
              <p className="text-lg font-bold">{weatherStats.total}</p>
              <p className="text-xs">All</p>
            </button>
            <button
              onClick={() => setActiveTab('vfr')}
              className={cn(
                "p-2 rounded-lg text-center transition-all border",
                activeTab === 'vfr'
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              )}
            >
              <p className="text-lg font-bold">{weatherStats.vfr}</p>
              <p className="text-xs">VFR</p>
            </button>
            <button
              onClick={() => setActiveTab('mvfr')}
              className={cn(
                "p-2 rounded-lg text-center transition-all border",
                activeTab === 'mvfr'
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              )}
            >
              <p className="text-lg font-bold">{weatherStats.mvfr}</p>
              <p className="text-xs">MVFR</p>
            </button>
            <button
              onClick={() => setActiveTab('ifr')}
              className={cn(
                "p-2 rounded-lg text-center transition-all border",
                activeTab === 'ifr'
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
              )}
            >
              <p className="text-lg font-bold">{weatherStats.ifr}</p>
              <p className="text-xs">IFR/LIFR</p>
            </button>
          </div>

          {/* Ideal Weather Analysis */}
          {weatherStats.total >= 3 && (
            <div className="mb-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Cloud className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Weather Pattern Analysis</span>
              </div>
              <p className="text-xs text-blue-700">
                {pilotName} has flown {Math.round((weatherStats.vfr / weatherStats.total) * 100)}% VFR, {Math.round((weatherStats.mvfr / weatherStats.total) * 100)}% MVFR, and {Math.round((weatherStats.ifr / weatherStats.total) * 100)}% IFR/LIFR conditions.
                {weatherStats.vfr > weatherStats.ifr && (
                  <span className="block mt-1">Most experienced in clear weather conditions.</span>
                )}
                {weatherStats.ifr >= weatherStats.vfr && (
                  <span className="block mt-1">Experienced in instrument conditions - strong IFR capability.</span>
                )}
              </p>
            </div>
          )}

          {/* Flight List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredFlights.length === 0 ? (
              <div className="p-4 text-center text-zinc-500 text-sm">
                No flights found for this weather category
              </div>
            ) : (
              filteredFlights.map((flight: Flight) => {
                const isExpanded = expandedFlight === flight._id;
                const weather = flight.weather;
                const arrivalWeather = flight.arrivalWeather;
                const aircraft = typeof flight.aircraft === 'object' ? flight.aircraft : null;

                return (
                  <div
                    key={flight._id}
                    className="bg-zinc-50 rounded-lg border border-zinc-200 overflow-hidden"
                  >
                    {/* Flight Header */}
                    <div
                      className="p-3 cursor-pointer hover:bg-zinc-100 transition-colors"
                      onClick={() => setExpandedFlight(isExpanded ? null : flight._id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-zinc-400" />
                            <span className="font-medium text-zinc-900">
                              {flight.departureAirport}
                            </span>
                            <Navigation className="w-3 h-3 text-zinc-400 mx-1" />
                            <span className="font-medium text-zinc-900">
                              {flight.arrivalAirport || flight.departureAirport}
                            </span>
                          </div>
                          {weather && (
                            <span className={cn(
                              "px-2 py-0.5 text-xs font-medium rounded border",
                              getFlightCategoryColor(weather.flightCategory)
                            )}>
                              {weather.flightCategory}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500">
                            {formatDate(flight.scheduledDate)}
                          </span>
                          <Badge variant={getStatusBadgeColor(flight.status) as any} className="text-xs">
                            {flight.status}
                          </Badge>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-zinc-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                        {aircraft && (
                          <span className="font-medium text-blue-600">
                            {aircraft.tailNumber} ({aircraft.model})
                          </span>
                        )}
                        {flight.scheduledTime && (
                          <span>@ {formatTime(flight.scheduledTime)}</span>
                        )}
                      </div>
                    </div>

                    {/* Expanded Weather Details */}
                    {isExpanded && (
                      <div className="border-t border-zinc-200 p-3 bg-white">
                        {/* Departure Weather */}
                        {weather ? (
                          <div className="mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Cloud className="w-4 h-4 text-blue-500" />
                              <span className="text-sm font-medium text-zinc-700">
                                Departure Weather ({weather.station})
                              </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                <Eye className="w-4 h-4 text-zinc-400" />
                                <div>
                                  <p className="text-xs text-zinc-500">Visibility</p>
                                  <p className="text-sm font-medium text-zinc-900">{weather.visibility} SM</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                <Cloud className="w-4 h-4 text-zinc-400" />
                                <div>
                                  <p className="text-xs text-zinc-500">Ceiling</p>
                                  <p className="text-sm font-medium text-zinc-900">
                                    {weather.ceiling ? `${weather.ceiling} ft` : 'CLR'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                <Wind className="w-4 h-4 text-zinc-400" />
                                <div>
                                  <p className="text-xs text-zinc-500">Wind</p>
                                  <p className="text-sm font-medium text-zinc-900">
                                    {weather.wind.direction}° @ {weather.wind.speed}kt
                                    {weather.wind.gust && ` G${weather.wind.gust}`}
                                  </p>
                                </div>
                              </div>
                              {weather.temperature !== undefined && (
                                <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                  <Thermometer className="w-4 h-4 text-zinc-400" />
                                  <div>
                                    <p className="text-xs text-zinc-500">Temp/Dew</p>
                                    <p className="text-sm font-medium text-zinc-900">
                                      {weather.temperature}°/{weather.dewpoint || '--'}°C
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                            {weather.metar && (
                              <div className="mt-2 p-2 bg-zinc-100 rounded text-xs font-mono text-zinc-600 break-all">
                                {weather.metar}
                              </div>
                            )}
                            {weather.densityAltitude !== undefined && (
                              <p className="text-xs text-zinc-500 mt-1">
                                Density Altitude: {weather.densityAltitude} ft
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="mb-3 p-3 bg-zinc-50 rounded text-center">
                            <Cloud className="w-6 h-6 text-zinc-300 mx-auto mb-1" />
                            <p className="text-xs text-zinc-500">No weather data recorded</p>
                          </div>
                        )}

                        {/* Arrival Weather (if different airport) */}
                        {arrivalWeather && flight.arrivalAirport && flight.arrivalAirport !== flight.departureAirport && (
                          <div className="mt-3 pt-3 border-t border-zinc-100">
                            <div className="flex items-center gap-2 mb-2">
                              <Navigation className="w-4 h-4 text-green-500" />
                              <span className="text-sm font-medium text-zinc-700">
                                Arrival Weather ({arrivalWeather.station})
                              </span>
                              <span className={cn(
                                "px-2 py-0.5 text-xs font-medium rounded border",
                                getFlightCategoryColor(arrivalWeather.flightCategory)
                              )}>
                                {arrivalWeather.flightCategory}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                <Eye className="w-4 h-4 text-zinc-400" />
                                <div>
                                  <p className="text-xs text-zinc-500">Visibility</p>
                                  <p className="text-sm font-medium text-zinc-900">{arrivalWeather.visibility} SM</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                <Cloud className="w-4 h-4 text-zinc-400" />
                                <div>
                                  <p className="text-xs text-zinc-500">Ceiling</p>
                                  <p className="text-sm font-medium text-zinc-900">
                                    {arrivalWeather.ceiling ? `${arrivalWeather.ceiling} ft` : 'CLR'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                <Wind className="w-4 h-4 text-zinc-400" />
                                <div>
                                  <p className="text-xs text-zinc-500">Wind</p>
                                  <p className="text-sm font-medium text-zinc-900">
                                    {arrivalWeather.wind.direction}° @ {arrivalWeather.wind.speed}kt
                                    {arrivalWeather.wind.gust && ` G${arrivalWeather.wind.gust}`}
                                  </p>
                                </div>
                              </div>
                              {arrivalWeather.temperature !== undefined && (
                                <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                  <Thermometer className="w-4 h-4 text-zinc-400" />
                                  <div>
                                    <p className="text-xs text-zinc-500">Temp/Dew</p>
                                    <p className="text-sm font-medium text-zinc-900">
                                      {arrivalWeather.temperature}°/{arrivalWeather.dewpoint || '--'}°C
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Safety Analysis Summary */}
                        {flight.safetyAnalysisSnapshot && (
                          <div className="mt-3 pt-3 border-t border-zinc-100">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500">Safety Score</span>
                              <Badge variant={
                                flight.safetyAnalysisSnapshot.overallScore >= 70 ? 'success' :
                                flight.safetyAnalysisSnapshot.overallScore >= 50 ? 'warning' : 'destructive'
                              }>
                                {flight.safetyAnalysisSnapshot.overallScore}/100
                              </Badge>
                            </div>
                            {flight.safetyAnalysisSnapshot.goNoGoRecommendation && (
                              <p className="text-xs text-zinc-600 mt-1">
                                Recommendation: <span className="font-medium">{flight.safetyAnalysisSnapshot.goNoGoRecommendation.toUpperCase()}</span>
                              </p>
                            )}
                          </div>
                        )}

                        {/* Flight Notes */}
                        {flight.notes && (
                          <div className="mt-3 pt-3 border-t border-zinc-100">
                            <p className="text-xs text-zinc-500">Notes</p>
                            <p className="text-sm text-zinc-700 mt-1">{flight.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div className="p-4 bg-zinc-50 rounded-lg text-center">
          <Plane className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">
            No flight history available
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            Create flights from the Flights page to track weather conditions
          </p>
        </div>
      )}
    </div>
  );
}

function AddPilotModal({
  onClose,
  onCreated,
  createPilot,
}: {
  onClose: () => void;
  onCreated: () => void;
  createPilot: any;
}) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    certificateType: 'PPL',
    instrumentRated: false,
    totalHours: 0,
    medicalExpiration: new Date().toISOString().split('T')[0],
    flightReviewExpiration: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createPilot.mutate({
      name: formData.name,
      email: formData.email,
      certificates: {
        type: formData.certificateType,
        instrumentRated: formData.instrumentRated,
      },
      experience: {
        totalHours: formData.totalHours,
        nightHours: 0,
        ifrHours: 0,
        picHours: 0,
      },
      medicalExpiration: formData.medicalExpiration,
      flightReviewExpiration: formData.flightReviewExpiration,
    }, {
      onSuccess: onCreated,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold text-zinc-900 mb-4">Add Pilot</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Certificate</label>
              <select
                value={formData.certificateType}
                onChange={(e) => setFormData({ ...formData, certificateType: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900"
              >
                <option value="PPL">Private (PPL)</option>
                <option value="CPL">Commercial (CPL)</option>
                <option value="ATP">ATP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Total Hours</label>
              <input
                type="number"
                value={formData.totalHours}
                onChange={(e) => setFormData({ ...formData, totalHours: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="instrumentRated"
              checked={formData.instrumentRated}
              onChange={(e) => setFormData({ ...formData, instrumentRated: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="instrumentRated" className="text-sm text-zinc-700">
              Instrument Rated
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Medical Expires</label>
              <input
                type="date"
                value={formData.medicalExpiration}
                onChange={(e) => setFormData({ ...formData, medicalExpiration: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Flight Review</label>
              <input
                type="date"
                value={formData.flightReviewExpiration}
                onChange={(e) => setFormData({ ...formData, flightReviewExpiration: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900"
                required
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={createPilot.isPending} className="flex-1">
              {createPilot.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Pilot
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
