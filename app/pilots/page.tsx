'use client';

import { useState, useEffect } from 'react';
import { User, Plus, Clock, AlertTriangle, CheckCircle, Trash2, RefreshCw, Shield, Award, Mail, Save, FileText, ChevronDown, ChevronUp, Pencil, X, Check } from 'lucide-react';
import { usePilots, useCreatePilot, useDeletePilot, useParsedDocuments, useGeneratePilotSafetyAnalysis } from '@/lib/hooks';
import type { Pilot } from '@/lib/types';
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
      <p className="text-zinc-600 dark:text-zinc-400">Failed to load pilots</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Pilots</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Manage your pilot roster</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Pilot
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Total Pilots</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{pilots?.length || 0}</p>
        </div>
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Instrument Rated</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {pilots?.filter(p => p.certificates?.instrumentRated).length || 0}
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Expiring Soon</p>
          <p className="text-2xl font-bold text-amber-500">
            {pilots?.filter(p => getDaysUntil(p.medicalExpiration) < 30 && getDaysUntil(p.medicalExpiration) >= 0).length || 0}
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Expired</p>
          <p className="text-2xl font-bold text-red-500">
            {pilots?.filter(p => getDaysUntil(p.medicalExpiration) < 0).length || 0}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pilot List */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Pilot Roster</h3>
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
                      "p-4 border-b border-zinc-100 dark:border-zinc-700 cursor-pointer transition-colors",
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-900/30"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{pilot.name}</span>
                      {getCertBadge(pilot.certificates?.type || 'PPL')}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
                      <span>{pilot.experience?.totalHours || 0} hours</span>
                      <span className={medicalStatus.color}>Medical: {medicalStatus.text}</span>
                    </div>
                  </div>
                );
              })}
              {(!pilots || pilots.length === 0) && (
                <div className="p-8 text-center">
                  <User className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-500 dark:text-zinc-400">No pilots added yet</p>
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
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 min-h-[500px]">
            {selectedPilot ? (
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-zinc-100 dark:bg-zinc-700 rounded-full flex items-center justify-center">
                        <User className="w-7 h-7 text-zinc-500 dark:text-zinc-400" />
                      </div>
                      <div>
                        {/* Editable Name */}
                        {editingName !== null ? (
                          <div className="flex items-center gap-2 mb-1">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="text-xl font-bold px-2 py-1 border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveField('name', editingName)}
                              disabled={isSaving}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => setEditingName(null)}
                              className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group mb-1">
                            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{selectedPilot.name}</h2>
                            <button
                              onClick={() => setEditingName(selectedPilot.name)}
                              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
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
                            className="flex-1 px-2 py-1 text-sm border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
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
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                  {/* Experience */}
                  <div>
                    <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                      <Award className="w-4 h-4" /> Experience
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Total Hours</p>
                        <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{selectedPilot.experience?.totalHours || 0}</p>
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">Night Hours</p>
                        <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{selectedPilot.experience?.nightHours || 0}</p>
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">IFR Hours</p>
                        <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{selectedPilot.experience?.ifrHours || 0}</p>
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">PIC Hours</p>
                        <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{selectedPilot.experience?.picHours || 0}</p>
                      </div>
                    </div>
                  </div>

                  {/* Currency */}
                  <div>
                    <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Currency Status
                    </h4>
                    <div className="space-y-3">
                      {/* Medical */}
                      <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg group">
                        <span className="text-zinc-700 dark:text-zinc-300">Medical</span>
                        <div className="flex items-center gap-2">
                          {editingMedical !== null ? (
                            <>
                              <input
                                type="date"
                                value={editingMedical}
                                onChange={(e) => setEditingMedical(e.target.value)}
                                className="px-2 py-1 text-sm border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                              />
                              <button
                                onClick={() => handleSaveField('medicalExpiration', editingMedical)}
                                disabled={isSaving}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditingMedical(null)}
                                className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                                {new Date(selectedPilot.medicalExpiration).toLocaleDateString()}
                              </span>
                              <Badge variant={getExpirationStatus(selectedPilot.medicalExpiration).badge as any}>
                                {getExpirationStatus(selectedPilot.medicalExpiration).text}
                              </Badge>
                              <button
                                onClick={() => setEditingMedical(new Date(selectedPilot.medicalExpiration).toISOString().split('T')[0])}
                                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Flight Review */}
                      <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg group">
                        <span className="text-zinc-700 dark:text-zinc-300">Flight Review</span>
                        <div className="flex items-center gap-2">
                          {editingFlightReview !== null ? (
                            <>
                              <input
                                type="date"
                                value={editingFlightReview}
                                onChange={(e) => setEditingFlightReview(e.target.value)}
                                className="px-2 py-1 text-sm border border-zinc-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                              />
                              <button
                                onClick={() => handleSaveField('flightReviewExpiration', editingFlightReview)}
                                disabled={isSaving}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditingFlightReview(null)}
                                className="p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                                {new Date(selectedPilot.flightReviewExpiration).toLocaleDateString()}
                              </span>
                              <Badge variant={getExpirationStatus(selectedPilot.flightReviewExpiration).badge as any}>
                                {getExpirationStatus(selectedPilot.flightReviewExpiration).text}
                              </Badge>
                              <button
                                onClick={() => setEditingFlightReview(new Date(selectedPilot.flightReviewExpiration).toISOString().split('T')[0])}
                                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
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
                      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
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
                      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 text-center">
                        <RefreshCw className="w-8 h-8 text-blue-500 mx-auto mb-2 animate-spin" />
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                          Generating safety analysis...
                        </p>
                      </div>
                    ) : selectedPilot.safetyAnalysis ? (
                      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-zinc-600 dark:text-zinc-400">Risk Score</span>
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
                              <span className="text-xs text-zinc-500 dark:text-zinc-400 uppercase">{finding.category}</span>
                              <p className="text-zinc-600 dark:text-zinc-400">{finding.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 text-center">
                        <Shield className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <User className="w-12 h-12 text-zinc-300 dark:text-zinc-600 mb-4" />
                <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">No Pilot Selected</h3>
                <p className="text-zinc-500 dark:text-zinc-400 mt-2">Select a pilot to view their details</p>
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
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">Delete Pilot?</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
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
      <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-center">
        <RefreshCw className="w-6 h-6 text-zinc-400 mx-auto animate-spin" />
      </div>
    );
  }

  const linkedDocs = documents?.filter((doc: any) => doc.status === 'completed') || [];

  return (
    <div>
      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
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
                className="bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden"
              >
                {/* Document Header */}
                <div
                  className="p-3 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  onClick={() => setExpandedDoc(isExpanded ? null : doc._id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[200px]">
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
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
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
                  <div className="border-t border-zinc-200 dark:border-zinc-700 max-h-72 overflow-y-auto">
                    {entries.slice(0, 50).map((entry: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
                        <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                          {entry.aircraftIdent && (
                            <span className="font-medium text-blue-600 dark:text-blue-400">
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
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
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
        <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg text-center">
          <FileText className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No linked documents
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            Upload pilot logbooks from the Files page and link them to this pilot
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
      <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">Add Pilot</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Certificate</label>
              <select
                value={formData.certificateType}
                onChange={(e) => setFormData({ ...formData, certificateType: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              >
                <option value="PPL">Private (PPL)</option>
                <option value="CPL">Commercial (CPL)</option>
                <option value="ATP">ATP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Total Hours</label>
              <input
                type="number"
                value={formData.totalHours}
                onChange={(e) => setFormData({ ...formData, totalHours: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
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
            <label htmlFor="instrumentRated" className="text-sm text-zinc-700 dark:text-zinc-300">
              Instrument Rated
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Medical Expires</label>
              <input
                type="date"
                value={formData.medicalExpiration}
                onChange={(e) => setFormData({ ...formData, medicalExpiration: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Flight Review</label>
              <input
                type="date"
                value={formData.flightReviewExpiration}
                onChange={(e) => setFormData({ ...formData, flightReviewExpiration: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
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
