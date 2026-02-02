'use client';

import React, { useState, useEffect } from 'react';
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Pilot List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="p-3 border-b border-zinc-200 bg-zinc-50">
              <h3 className="font-semibold text-zinc-900">Pilot Roster</h3>
            </div>
            <div className="max-h-[250px] sm:max-h-[350px] lg:max-h-[500px] overflow-y-auto">
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
          <div className="bg-white rounded-xl border border-zinc-200 min-h-[350px] lg:min-h-[500px]">
            {selectedPilot ? (
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="p-4 sm:p-6 border-b border-zinc-200">
                  <div className="flex items-start sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                      <div className="w-10 h-10 sm:w-14 sm:h-14 bg-zinc-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 sm:w-7 sm:h-7 text-zinc-500" />
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
                <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4 sm:space-y-6">
                  {/* Experience */}
                  <div>
                    <h4 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                      <Award className="w-4 h-4" /> Experience
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
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

                  {/* Flight History with Weather - Combined logbook and planned flights */}
                  <PilotFlightHistorySection pilotId={selectedPilot._id} pilotName={selectedPilot.name} />

                  {/* Linked Documents */}
                  <PilotLinkedDocumentsSection pilotId={selectedPilot._id} />
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
        <FileText className="w-4 h-4" /> Source Documents
        {linkedDocs.length > 0 && (
          <Badge variant="secondary" className="text-xs">{linkedDocs.length}</Badge>
        )}
      </h4>
      {linkedDocs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {linkedDocs.map((doc: any) => {
            const entries = doc.entries || [];

            return (
              <div
                key={doc._id}
                className="bg-zinc-50 rounded-lg border border-zinc-200 p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="text-sm font-medium text-zinc-900 truncate">
                      {doc.originalFilename || doc.filename}
                    </h5>
                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                      <Badge variant="outline" className="text-xs">
                        {doc.documentType?.replace(/_/g, ' ')}
                      </Badge>
                      <span>{entries.length} flights</span>
                      {doc.summary?.totalHours && (
                        <span>{doc.summary.totalHours.toFixed(1)}h</span>
                      )}
                    </div>
                    {doc.summary?.dateRange && (
                      <p className="text-xs text-zinc-500 mt-1">
                        {doc.summary.dateRange.from} to {doc.summary.dateRange.to}
                      </p>
                    )}
                  </div>
                </div>
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
  const { data: documents } = useParsedDocuments({ pilotId });
  const [expandedFlight, setExpandedFlight] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'planned' | 'logbook'>('all');
  const [historicalWeather, setHistoricalWeather] = useState<Map<string, any>>(new Map());
  const [loadingWeather, setLoadingWeather] = useState(false);

  // Extract all logbook entries from linked documents
  const logbookEntries = React.useMemo(() => {
    if (!documents) return [];
    const completedDocs = documents.filter((doc: any) => doc.status === 'completed');
    return completedDocs.flatMap((doc: any) =>
      (doc.entries || []).map((entry: any) => ({ ...entry, _source: 'logbook', _docId: doc._id }))
    );
  }, [documents]);

  // Fetch historical weather for logbook entries
  React.useEffect(() => {
    if (logbookEntries.length === 0) return;

    const fetchHistoricalWeather = async () => {
      setLoadingWeather(true);
      const weatherMap = new Map();

      const batchSize = 5;
      const entries = logbookEntries.slice(0, 50);

      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (entry: any, batchIdx: number) => {
            if (!entry.date || !entry.from) return;

            const entryIdx = i + batchIdx;

            try {
              const res = await fetch('/api/weather/historical', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  airport: entry.from,
                  date: entry.date,
                }),
              });

              const data = await res.json();
              if (res.ok && data.success && data.weather) {
                weatherMap.set(`logbook-${entryIdx}`, data.weather);
              }
            } catch (error) {
              console.error(`Failed to fetch weather for ${entry.from}:`, error);
            }
          })
        );

        if (i + batchSize < entries.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setHistoricalWeather(weatherMap);
      setLoadingWeather(false);
    };

    fetchHistoricalWeather();
  }, [logbookEntries]);

  // Combine planned flights and logbook entries
  const allFlightsAndEntries = React.useMemo(() => {
    const combined: any[] = [];

    // Add planned flights
    if (flights) {
      flights.forEach((flight: Flight) => {
        combined.push({
          ...flight,
          _type: 'planned',
          _sortDate: new Date(flight.scheduledDate),
        });
      });
    }

    // Add logbook entries with historical weather
    logbookEntries.forEach((entry: any, idx: number) => {
      const weather = historicalWeather.get(`logbook-${idx}`);
      combined.push({
        ...entry,
        _type: 'logbook',
        _sortDate: entry.date ? new Date(entry.date) : new Date(0),
        _weatherIdx: idx,
        weather: weather ? {
          ...weather.conditions,
          metar: weather.metar,
          flightCategory: weather.conditions.flightCategory,
          station: entry.from,
        } : undefined,
      });
    });

    // Sort by date (newest first)
    return combined.sort((a, b) => b._sortDate.getTime() - a._sortDate.getTime());
  }, [flights, logbookEntries, historicalWeather]);

  // Filter based on active tab
  const filteredFlights = allFlightsAndEntries.filter((item: any) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'planned') return item._type === 'planned';
    if (activeTab === 'logbook') return item._type === 'logbook';
    return true;
  });

  // Calculate weather stats
  const weatherStats = {
    total: allFlightsAndEntries.length,
    planned: allFlightsAndEntries.filter((f: any) => f._type === 'planned').length,
    logbook: allFlightsAndEntries.filter((f: any) => f._type === 'logbook').length,
    vfr: allFlightsAndEntries.filter((f: any) => f.weather?.flightCategory === 'VFR').length,
    mvfr: allFlightsAndEntries.filter((f: any) => f.weather?.flightCategory === 'MVFR').length,
    ifr: allFlightsAndEntries.filter((f: any) => f.weather?.flightCategory === 'IFR' || f.weather?.flightCategory === 'LIFR').length,
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

  if (isLoading) {
    return (
      <div className="p-4 bg-zinc-50 rounded-lg text-center">
        <RefreshCw className="w-6 h-6 text-zinc-400 mx-auto animate-spin" />
        <p className="text-sm text-zinc-500 mt-2">Loading flight history...</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
        <Plane className="w-4 h-4" /> Flight History & Weather Analysis
        {allFlightsAndEntries.length > 0 && (
          <Badge variant="secondary" className="text-xs">{allFlightsAndEntries.length} total</Badge>
        )}
      </h4>

      {allFlightsAndEntries.length > 0 ? (
        <>
          {/* Filter Tabs */}
          <div className="grid grid-cols-3 gap-2 mb-4">
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
              <p className="text-xs">All Flights</p>
            </button>
            <button
              onClick={() => setActiveTab('logbook')}
              className={cn(
                "p-2 rounded-lg text-center transition-all border",
                activeTab === 'logbook'
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              )}
            >
              <p className="text-lg font-bold">{weatherStats.logbook}</p>
              <p className="text-xs">From Logbook</p>
            </button>
            <button
              onClick={() => setActiveTab('planned')}
              className={cn(
                "p-2 rounded-lg text-center transition-all border",
                activeTab === 'planned'
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              )}
            >
              <p className="text-lg font-bold">{weatherStats.planned}</p>
              <p className="text-xs">Planned</p>
            </button>
          </div>

          {/* Weather Summary */}
          {loadingWeather && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
              <RefreshCw className="w-4 h-4 text-blue-500 mx-auto animate-spin mb-1" />
              <p className="text-xs text-blue-700">Loading historical weather...</p>
            </div>
          )}

          {/* Weather Experience Analysis */}
          {weatherStats.logbook >= 3 && (weatherStats.vfr > 0 || weatherStats.mvfr > 0 || weatherStats.ifr > 0) && (
            <div className="mb-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Cloud className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Weather Experience Analysis</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="text-center p-2 bg-emerald-100 rounded border border-emerald-200">
                  <p className="text-lg font-bold text-emerald-700">{Math.round((weatherStats.vfr / weatherStats.logbook) * 100)}%</p>
                  <p className="text-xs text-emerald-600">VFR</p>
                </div>
                <div className="text-center p-2 bg-blue-100 rounded border border-blue-200">
                  <p className="text-lg font-bold text-blue-700">{Math.round((weatherStats.mvfr / weatherStats.logbook) * 100)}%</p>
                  <p className="text-xs text-blue-600">MVFR</p>
                </div>
                <div className="text-center p-2 bg-red-100 rounded border border-red-200">
                  <p className="text-lg font-bold text-red-700">{Math.round((weatherStats.ifr / weatherStats.logbook) * 100)}%</p>
                  <p className="text-xs text-red-600">IFR/LIFR</p>
                </div>
              </div>
              <p className="text-xs text-blue-700">
                Based on {weatherStats.logbook} logbook entries with weather data.
                {weatherStats.vfr / weatherStats.logbook >= 0.7 && ' Primarily flies in clear conditions.'}
                {weatherStats.ifr / weatherStats.logbook >= 0.2 && weatherStats.vfr / weatherStats.logbook < 0.7 && ' Experienced with marginal and instrument conditions.'}
                {weatherStats.ifr / weatherStats.logbook >= 0.4 && ' Strong IFR experience.'}
              </p>
            </div>
          )}

          {/* Flight List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredFlights.length === 0 ? (
              <div className="p-4 text-center text-zinc-500 text-sm">
                No flights found
              </div>
            ) : (
              filteredFlights.map((item: any, idx: number) => {
                const isLogbook = item._type === 'logbook';
                const flightId = isLogbook ? `logbook-${idx}` : item._id;
                const isExpanded = expandedFlight === flightId;
                const weather = item.weather;

                // For logbook entries
                const departureAirport = isLogbook ? item.from : item.departureAirport;
                const arrivalAirport = isLogbook ? item.to : (item.arrivalAirport || item.departureAirport);
                const flightDate = isLogbook ? item.date : item.scheduledDate;
                const aircraftIdent = isLogbook ? item.aircraftIdent : null;
                const aircraft = !isLogbook && typeof item.aircraft === 'object' ? item.aircraft : null;

                return (
                  <div
                    key={flightId}
                    className="bg-zinc-50 rounded-lg border border-zinc-200 overflow-hidden"
                  >
                    {/* Flight Header */}
                    <div
                      className="p-3 cursor-pointer hover:bg-zinc-100 transition-colors"
                      onClick={() => setExpandedFlight(isExpanded ? null : flightId)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-zinc-400" />
                            <span className="font-medium text-zinc-900">
                              {departureAirport}
                            </span>
                            <Navigation className="w-3 h-3 text-zinc-400 mx-1" />
                            <span className="font-medium text-zinc-900">
                              {arrivalAirport || departureAirport}
                            </span>
                          </div>
                          {weather?.flightCategory && (
                            <span className={cn(
                              "px-2 py-0.5 text-xs font-medium rounded border",
                              getFlightCategoryColor(weather.flightCategory)
                            )}>
                              {weather.flightCategory}
                            </span>
                          )}
                          <Badge variant={isLogbook ? 'secondary' : 'default'} className="text-xs">
                            {isLogbook ? 'Logbook' : 'Planned'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500">
                            {formatDate(flightDate)}
                          </span>
                          {!isLogbook && item.status && (
                            <Badge variant={getStatusBadgeColor(item.status) as any} className="text-xs">
                              {item.status}
                            </Badge>
                          )}
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
                        {aircraftIdent && (
                          <span className="font-medium text-blue-600">
                            {aircraftIdent}
                          </span>
                        )}
                        {isLogbook && item.totalTime > 0 && (
                          <span>{item.totalTime}h total</span>
                        )}
                        {!isLogbook && item.scheduledTime && (
                          <span>@ {formatTime(item.scheduledTime)}</span>
                        )}
                      </div>
                    </div>

                    {/* Expanded Weather Details */}
                    {isExpanded && (
                      <div className="border-t border-zinc-200 p-3 bg-white">
                        {/* Logbook Flight Details */}
                        {isLogbook && (
                          <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-zinc-600">
                            {item.pic > 0 && <div><span className="text-zinc-500">PIC:</span> {item.pic}h</div>}
                            {item.night > 0 && <div><span className="text-zinc-500">Night:</span> {item.night}h</div>}
                            {item.crossCountry > 0 && <div><span className="text-zinc-500">XC:</span> {item.crossCountry}h</div>}
                            {item.actualInstrument > 0 && <div><span className="text-zinc-500">Actual:</span> {item.actualInstrument}h</div>}
                            {item.landingsDay > 0 && <div><span className="text-zinc-500">Day Landings:</span> {item.landingsDay}</div>}
                            {item.landingsNight > 0 && <div><span className="text-zinc-500">Night Landings:</span> {item.landingsNight}</div>}
                          </div>
                        )}

                        {/* Weather Data */}
                        {weather ? (
                          <div className="mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Cloud className="w-4 h-4 text-blue-500" />
                              <span className="text-sm font-medium text-zinc-700">
                                {isLogbook ? 'Historical Weather' : 'Departure Weather'} ({weather.station || departureAirport})
                              </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {weather.visibility !== undefined && (
                                <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                  <Eye className="w-4 h-4 text-zinc-400" />
                                  <div>
                                    <p className="text-xs text-zinc-500">Visibility</p>
                                    <p className="text-sm font-medium text-zinc-900">{weather.visibility} SM</p>
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                <Cloud className="w-4 h-4 text-zinc-400" />
                                <div>
                                  <p className="text-xs text-zinc-500">Ceiling</p>
                                  <p className="text-sm font-medium text-zinc-900">
                                    {weather.ceiling ? `${weather.ceiling} ft` : (weather.skyConditions?.[0]?.coverage || 'CLR')}
                                  </p>
                                </div>
                              </div>
                              {weather.wind && (
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
                              )}
                              {weather.temperature !== undefined && (
                                <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                  <Thermometer className="w-4 h-4 text-zinc-400" />
                                  <div>
                                    <p className="text-xs text-zinc-500">Temp/Dew</p>
                                    <p className="text-sm font-medium text-zinc-900">
                                      {Math.round(weather.temperature)}°/{weather.dewpoint ? Math.round(weather.dewpoint) : '--'}°C
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                            {/* Sky Conditions */}
                            {weather.skyConditions && weather.skyConditions.length > 0 && (
                              <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
                                <span className="font-medium">Sky:</span>
                                {weather.skyConditions.map((layer: any, idx: number) => (
                                  <span key={idx} className="px-1.5 py-0.5 bg-zinc-100 rounded border border-zinc-200">
                                    {layer.coverage}
                                    {layer.altitude && ` ${layer.altitude}ft`}
                                  </span>
                                ))}
                              </div>
                            )}
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

                        {/* Logbook Remarks */}
                        {isLogbook && item.remarks && (
                          <div className="mt-3 pt-3 border-t border-zinc-100">
                            <p className="text-xs text-zinc-500 font-medium mb-1">Remarks</p>
                            <p className="text-sm text-zinc-700">{item.remarks}</p>
                          </div>
                        )}

                        {/* Arrival Weather (if different airport) - Only for planned flights */}
                        {!isLogbook && item.arrivalWeather && item.arrivalAirport && item.arrivalAirport !== departureAirport && (
                          <div className="mt-3 pt-3 border-t border-zinc-100">
                            <div className="flex items-center gap-2 mb-2">
                              <Navigation className="w-4 h-4 text-green-500" />
                              <span className="text-sm font-medium text-zinc-700">
                                Arrival Weather ({item.arrivalWeather.station})
                              </span>
                              <span className={cn(
                                "px-2 py-0.5 text-xs font-medium rounded border",
                                getFlightCategoryColor(item.arrivalWeather.flightCategory)
                              )}>
                                {item.arrivalWeather.flightCategory}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                <Eye className="w-4 h-4 text-zinc-400" />
                                <div>
                                  <p className="text-xs text-zinc-500">Visibility</p>
                                  <p className="text-sm font-medium text-zinc-900">{item.arrivalWeather.visibility} SM</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                <Cloud className="w-4 h-4 text-zinc-400" />
                                <div>
                                  <p className="text-xs text-zinc-500">Ceiling</p>
                                  <p className="text-sm font-medium text-zinc-900">
                                    {item.arrivalWeather.ceiling ? `${item.arrivalWeather.ceiling} ft` : 'CLR'}
                                  </p>
                                </div>
                              </div>
                              {item.arrivalWeather.wind && (
                                <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                  <Wind className="w-4 h-4 text-zinc-400" />
                                  <div>
                                    <p className="text-xs text-zinc-500">Wind</p>
                                    <p className="text-sm font-medium text-zinc-900">
                                      {item.arrivalWeather.wind.direction}° @ {item.arrivalWeather.wind.speed}kt
                                      {item.arrivalWeather.wind.gust && ` G${item.arrivalWeather.wind.gust}`}
                                    </p>
                                  </div>
                                </div>
                              )}
                              {item.arrivalWeather.temperature !== undefined && (
                                <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded">
                                  <Thermometer className="w-4 h-4 text-zinc-400" />
                                  <div>
                                    <p className="text-xs text-zinc-500">Temp/Dew</p>
                                    <p className="text-sm font-medium text-zinc-900">
                                      {Math.round(item.arrivalWeather.temperature)}°/{item.arrivalWeather.dewpoint ? Math.round(item.arrivalWeather.dewpoint) : '--'}°C
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Safety Analysis Summary - Only for planned flights */}
                        {!isLogbook && item.safetyAnalysisSnapshot && (
                          <div className="mt-3 pt-3 border-t border-zinc-100">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-zinc-500">Safety Score</span>
                              <Badge variant={
                                item.safetyAnalysisSnapshot.overallScore >= 70 ? 'success' :
                                item.safetyAnalysisSnapshot.overallScore >= 50 ? 'warning' : 'destructive'
                              }>
                                {item.safetyAnalysisSnapshot.overallScore}/100
                              </Badge>
                            </div>
                            {item.safetyAnalysisSnapshot.goNoGoRecommendation && (
                              <p className="text-xs text-zinc-600 mt-1">
                                Recommendation: <span className="font-medium">{item.safetyAnalysisSnapshot.goNoGoRecommendation.toUpperCase()}</span>
                              </p>
                            )}
                          </div>
                        )}

                        {/* Flight Notes - Only for planned flights */}
                        {!isLogbook && item.notes && (
                          <div className="mt-3 pt-3 border-t border-zinc-100">
                            <p className="text-xs text-zinc-500">Notes</p>
                            <p className="text-sm text-zinc-700 mt-1">{item.notes}</p>
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
