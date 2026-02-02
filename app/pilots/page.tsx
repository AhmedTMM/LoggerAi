'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, Plus, Clock, AlertTriangle, CheckCircle, Trash2, RefreshCw, Shield, Award, Mail, Save, FileText, ChevronDown, ChevronUp, Pencil, X, Check, Plane, Cloud, Wind, Eye, Thermometer, Navigation, MapPin, BarChart3, TrendingUp, Calendar, Activity } from 'lucide-react';
import { FlightPlaybackModal, FlightPlaybackButton } from '@/components/FlightPlayback';
import { usePilots, useCreatePilot, useDeletePilot, useParsedDocuments, useGeneratePilotSafetyAnalysis, useFlightsByPilot } from '@/lib/hooks';
import type { Pilot, Flight, WeatherData } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSkeleton';
import { cn, getDaysUntil } from '@/lib/utils';

// Weather experience data stored client-side
interface WeatherExperience {
  totalFlights: number;
  flightsWithWeather: number;
  vfr: number;
  mvfr: number;
  ifr: number;
  lifr: number;
  lastUpdated: Date;
}

type TabType = 'overview' | 'flights' | 'safety' | 'documents';

export default function PilotsPage() {
  const { data: pilots, isLoading, error, refetch } = usePilots();
  const createPilot = useCreatePilot();
  const deletePilot = useDeletePilot();
  const generateSafetyAnalysis = useGeneratePilotSafetyAnalysis();

  const [selectedPilot, setSelectedPilot] = useState<Pilot | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [editingEmail, setEditingEmail] = useState('');
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);

  // Editing states for name, medical, and flight review
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingMedical, setEditingMedical] = useState<string | null>(null);
  const [editingFlightReview, setEditingFlightReview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Client-side weather experience cache
  const [weatherExperienceCache, setWeatherExperienceCache] = useState<Map<string, WeatherExperience>>(new Map());

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

  // Update weather experience cache
  const updateWeatherCache = useCallback((pilotId: string, experience: WeatherExperience) => {
    setWeatherExperienceCache(prev => {
      const newMap = new Map(prev);
      newMap.set(pilotId, experience);
      return newMap;
    });
  }, []);

  if (isLoading) return <LoadingSpinner className="h-96" />;
  if (error) return (
    <div className="text-center py-12">
      <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
      <p className="text-zinc-600">Failed to load pilots</p>
    </div>
  );

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <User className="w-4 h-4" /> },
    { id: 'flights', label: 'Flights & Weather', icon: <Cloud className="w-4 h-4" /> },
    { id: 'safety', label: 'Safety', icon: <Shield className="w-4 h-4" /> },
    { id: 'documents', label: 'Documents', icon: <FileText className="w-4 h-4" /> },
  ];

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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Pilot List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="p-3 border-b border-zinc-200 bg-zinc-50">
              <h3 className="font-semibold text-zinc-900">Pilot Roster</h3>
            </div>
            <div className="max-h-[250px] sm:max-h-[350px] lg:max-h-[600px] overflow-y-auto">
              {pilots?.map((pilot) => {
                const isSelected = selectedPilot?._id === pilot._id;
                const medicalStatus = getExpirationStatus(pilot.medicalExpiration);

                return (
                  <div
                    key={pilot._id}
                    onClick={() => {
                      setSelectedPilot(pilot);
                      setEditingEmail((pilot as any).email || '');
                      setActiveTab('overview');
                    }}
                    className={cn(
                      "p-4 border-b border-zinc-100 cursor-pointer transition-colors",
                      isSelected
                        ? "bg-blue-50 border-l-4 border-l-blue-500"
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
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl border border-zinc-200 min-h-[350px] lg:min-h-[600px]">
            {selectedPilot ? (
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="p-4 sm:p-6 border-b border-zinc-200">
                  <div className="flex items-start sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
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

                {/* Tabs */}
                <div className="border-b border-zinc-200 px-4 sm:px-6">
                  <nav className="flex gap-1 -mb-px overflow-x-auto">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                          activeTab === tab.id
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
                        )}
                      >
                        {tab.icon}
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                </div>

                {/* Tab Content */}
                <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
                  {activeTab === 'overview' && (
                    <OverviewTab
                      pilot={selectedPilot}
                      editingEmail={editingEmail}
                      setEditingEmail={setEditingEmail}
                      handleSaveEmail={handleSaveEmail}
                      isSavingEmail={isSavingEmail}
                      editingMedical={editingMedical}
                      setEditingMedical={setEditingMedical}
                      editingFlightReview={editingFlightReview}
                      setEditingFlightReview={setEditingFlightReview}
                      handleSaveField={handleSaveField}
                      isSaving={isSaving}
                      getExpirationStatus={getExpirationStatus}
                      weatherExperience={weatherExperienceCache.get(selectedPilot._id)}
                    />
                  )}
                  {activeTab === 'flights' && (
                    <FlightsTab
                      pilotId={selectedPilot._id}
                      pilotName={selectedPilot.name}
                      onWeatherUpdate={(experience) => updateWeatherCache(selectedPilot._id, experience)}
                    />
                  )}
                  {activeTab === 'safety' && (
                    <SafetyTab
                      pilot={selectedPilot}
                      isGeneratingAnalysis={isGeneratingAnalysis}
                      setIsGeneratingAnalysis={setIsGeneratingAnalysis}
                      generateSafetyAnalysis={generateSafetyAnalysis}
                      refetch={refetch}
                      weatherExperience={weatherExperienceCache.get(selectedPilot._id)}
                    />
                  )}
                  {activeTab === 'documents' && (
                    <DocumentsTab pilotId={selectedPilot._id} />
                  )}
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

// Overview Tab Component
function OverviewTab({
  pilot,
  editingEmail,
  setEditingEmail,
  handleSaveEmail,
  isSavingEmail,
  editingMedical,
  setEditingMedical,
  editingFlightReview,
  setEditingFlightReview,
  handleSaveField,
  isSaving,
  getExpirationStatus,
  weatherExperience,
}: {
  pilot: Pilot;
  editingEmail: string;
  setEditingEmail: (email: string) => void;
  handleSaveEmail: () => void;
  isSavingEmail: boolean;
  editingMedical: string | null;
  setEditingMedical: (date: string | null) => void;
  editingFlightReview: string | null;
  setEditingFlightReview: (date: string | null) => void;
  handleSaveField: (field: 'name' | 'medicalExpiration' | 'flightReviewExpiration', value: string) => void;
  isSaving: boolean;
  getExpirationStatus: (date: Date | string) => { color: string; badge: string; text: string };
  weatherExperience?: WeatherExperience;
}) {
  return (
    <div className="space-y-6">
      {/* Contact */}
      <div className="bg-zinc-50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-700">Contact</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="email"
            value={editingEmail}
            onChange={(e) => setEditingEmail(e.target.value)}
            placeholder="pilot@email.com"
            className="flex-1 px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white text-zinc-900"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveEmail}
            disabled={isSavingEmail}
          >
            {isSavingEmail ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Experience Grid */}
      <div>
        <h4 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
          <Award className="w-4 h-4" /> Experience
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
            <p className="text-xs text-blue-600 font-medium">Total Hours</p>
            <p className="text-2xl font-bold text-blue-900">{pilot.experience?.totalHours || 0}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
            <p className="text-xs text-purple-600 font-medium">Night Hours</p>
            <p className="text-2xl font-bold text-purple-900">{pilot.experience?.nightHours || 0}</p>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border border-amber-200">
            <p className="text-xs text-amber-600 font-medium">IFR Hours</p>
            <p className="text-2xl font-bold text-amber-900">{pilot.experience?.ifrHours || 0}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border border-emerald-200">
            <p className="text-xs text-emerald-600 font-medium">PIC Hours</p>
            <p className="text-2xl font-bold text-emerald-900">{pilot.experience?.picHours || 0}</p>
          </div>
        </div>
      </div>

      {/* Currency Status */}
      <div>
        <h4 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4" /> Currency Status
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Medical */}
          <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  getExpirationStatus(pilot.medicalExpiration).badge === 'success' ? 'bg-emerald-500' :
                  getExpirationStatus(pilot.medicalExpiration).badge === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                )} />
                <span className="text-sm font-medium text-zinc-700">Medical</span>
              </div>
              <Badge variant={getExpirationStatus(pilot.medicalExpiration).badge as any}>
                {getExpirationStatus(pilot.medicalExpiration).text}
              </Badge>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-zinc-500 group">
              {editingMedical !== null ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="date"
                    value={editingMedical}
                    onChange={(e) => setEditingMedical(e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-zinc-300 rounded bg-white text-zinc-900"
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
                </div>
              ) : (
                <>
                  <span>{new Date(pilot.medicalExpiration).toLocaleDateString()}</span>
                  <button
                    onClick={() => setEditingMedical(new Date(pilot.medicalExpiration).toISOString().split('T')[0])}
                    className="p-1 text-zinc-400 hover:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Flight Review */}
          <div className="bg-zinc-50 rounded-lg p-4 border border-zinc-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  getExpirationStatus(pilot.flightReviewExpiration).badge === 'success' ? 'bg-emerald-500' :
                  getExpirationStatus(pilot.flightReviewExpiration).badge === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                )} />
                <span className="text-sm font-medium text-zinc-700">Flight Review</span>
              </div>
              <Badge variant={getExpirationStatus(pilot.flightReviewExpiration).badge as any}>
                {getExpirationStatus(pilot.flightReviewExpiration).text}
              </Badge>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-zinc-500 group">
              {editingFlightReview !== null ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="date"
                    value={editingFlightReview}
                    onChange={(e) => setEditingFlightReview(e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-zinc-300 rounded bg-white text-zinc-900"
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
                </div>
              ) : (
                <>
                  <span>{new Date(pilot.flightReviewExpiration).toLocaleDateString()}</span>
                  <button
                    onClick={() => setEditingFlightReview(new Date(pilot.flightReviewExpiration).toISOString().split('T')[0])}
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

      {/* Weather Experience Summary (if available) */}
      {weatherExperience && weatherExperience.flightsWithWeather >= 3 && (
        <div>
          <h4 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
            <Cloud className="w-4 h-4" /> Weather Experience Profile
          </h4>
          <WeatherExperienceCard experience={weatherExperience} compact />
        </div>
      )}
    </div>
  );
}

// Weather Experience Card Component
function WeatherExperienceCard({ experience, compact = false }: { experience: WeatherExperience; compact?: boolean }) {
  const total = experience.flightsWithWeather;
  const vfrPercent = Math.round((experience.vfr / total) * 100);
  const mvfrPercent = Math.round((experience.mvfr / total) * 100);
  const ifrPercent = Math.round(((experience.ifr + experience.lifr) / total) * 100);

  return (
    <div className={cn(
      "bg-gradient-to-br from-sky-50 to-blue-50 rounded-lg border border-sky-200",
      compact ? "p-4" : "p-6"
    )}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-sky-600" />
          <span className="font-medium text-sky-900">Weather Categories Flown</span>
        </div>
        <span className="text-xs text-sky-600">{total} flights analyzed</span>
      </div>

      {/* Visual Bar */}
      <div className="h-4 rounded-full bg-zinc-200 overflow-hidden flex mb-4">
        {vfrPercent > 0 && (
          <div
            className="bg-emerald-500 h-full transition-all"
            style={{ width: `${vfrPercent}%` }}
            title={`VFR: ${vfrPercent}%`}
          />
        )}
        {mvfrPercent > 0 && (
          <div
            className="bg-blue-500 h-full transition-all"
            style={{ width: `${mvfrPercent}%` }}
            title={`MVFR: ${mvfrPercent}%`}
          />
        )}
        {ifrPercent > 0 && (
          <div
            className="bg-red-500 h-full transition-all"
            style={{ width: `${ifrPercent}%` }}
            title={`IFR/LIFR: ${ifrPercent}%`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-xs text-zinc-600">VFR</span>
          </div>
          <p className="text-lg font-bold text-emerald-700">{vfrPercent}%</p>
          <p className="text-xs text-zinc-500">{experience.vfr} flights</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-xs text-zinc-600">MVFR</span>
          </div>
          <p className="text-lg font-bold text-blue-700">{mvfrPercent}%</p>
          <p className="text-xs text-zinc-500">{experience.mvfr} flights</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-xs text-zinc-600">IFR/LIFR</span>
          </div>
          <p className="text-lg font-bold text-red-700">{ifrPercent}%</p>
          <p className="text-xs text-zinc-500">{experience.ifr + experience.lifr} flights</p>
        </div>
      </div>

      {/* Insight */}
      {!compact && (
        <div className="mt-4 pt-4 border-t border-sky-200">
          <div className="flex items-start gap-2">
            <TrendingUp className="w-4 h-4 text-sky-600 mt-0.5" />
            <p className="text-sm text-sky-800">
              {vfrPercent >= 90 && 'Primarily VFR experience. Use caution in marginal conditions.'}
              {vfrPercent >= 70 && vfrPercent < 90 && mvfrPercent >= 15 && 'Good mix of VFR and marginal conditions experience.'}
              {ifrPercent >= 20 && 'Strong IFR experience. Comfortable with instrument conditions.'}
              {vfrPercent < 70 && ifrPercent < 20 && mvfrPercent >= 20 && 'Experienced with marginal weather conditions.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Flights Tab Component
function FlightsTab({
  pilotId,
  pilotName,
  onWeatherUpdate,
}: {
  pilotId: string;
  pilotName: string;
  onWeatherUpdate: (experience: WeatherExperience) => void;
}) {
  const { data: flights, isLoading } = useFlightsByPilot(pilotId);
  const { data: documents } = useParsedDocuments({ pilotId });
  const [expandedFlight, setExpandedFlight] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'planned' | 'logbook'>('all');
  const [historicalWeather, setHistoricalWeather] = useState<Map<string, any>>(new Map());
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [playbackFlight, setPlaybackFlight] = useState<any>(null);

  // Extract all logbook entries from linked documents
  const logbookEntries = useMemo(() => {
    if (!documents) return [];
    const completedDocs = documents.filter((doc: any) => doc.status === 'completed');
    return completedDocs.flatMap((doc: any) =>
      (doc.entries || []).map((entry: any) => ({ ...entry, _source: 'logbook', _docId: doc._id }))
    );
  }, [documents]);

  // Fetch historical weather for logbook entries
  useEffect(() => {
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
  const allFlightsAndEntries = useMemo(() => {
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
    if (activeFilter === 'all') return true;
    if (activeFilter === 'planned') return item._type === 'planned';
    if (activeFilter === 'logbook') return item._type === 'logbook';
    return true;
  });

  // Calculate weather stats and update parent
  const weatherStats = useMemo(() => {
    const stats = {
      total: allFlightsAndEntries.length,
      planned: allFlightsAndEntries.filter((f: any) => f._type === 'planned').length,
      logbook: allFlightsAndEntries.filter((f: any) => f._type === 'logbook').length,
      vfr: allFlightsAndEntries.filter((f: any) => f.weather?.flightCategory === 'VFR').length,
      mvfr: allFlightsAndEntries.filter((f: any) => f.weather?.flightCategory === 'MVFR').length,
      ifr: allFlightsAndEntries.filter((f: any) => f.weather?.flightCategory === 'IFR').length,
      lifr: allFlightsAndEntries.filter((f: any) => f.weather?.flightCategory === 'LIFR').length,
    };
    return stats;
  }, [allFlightsAndEntries]);

  // Update weather experience cache in parent
  useEffect(() => {
    if (!loadingWeather && weatherStats.logbook > 0) {
      const flightsWithWeather = weatherStats.vfr + weatherStats.mvfr + weatherStats.ifr + weatherStats.lifr;
      if (flightsWithWeather >= 3) {
        onWeatherUpdate({
          totalFlights: weatherStats.total,
          flightsWithWeather,
          vfr: weatherStats.vfr,
          mvfr: weatherStats.mvfr,
          ifr: weatherStats.ifr,
          lifr: weatherStats.lifr,
          lastUpdated: new Date(),
        });
      }
    }
  }, [weatherStats, loadingWeather, onWeatherUpdate]);

  const getFlightCategoryColor = (category?: string) => {
    switch (category?.toUpperCase()) {
      case 'VFR': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'MVFR': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'IFR': return 'bg-red-100 text-red-700 border-red-200';
      case 'LIFR': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-zinc-100 text-zinc-700 border-zinc-200';
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <RefreshCw className="w-8 h-8 text-zinc-400 mx-auto animate-spin" />
        <p className="text-sm text-zinc-500 mt-2">Loading flight history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Weather Experience Analysis */}
      {weatherStats.logbook >= 3 && (weatherStats.vfr > 0 || weatherStats.mvfr > 0 || weatherStats.ifr > 0) && (
        <WeatherExperienceCard
          experience={{
            totalFlights: weatherStats.total,
            flightsWithWeather: weatherStats.vfr + weatherStats.mvfr + weatherStats.ifr + weatherStats.lifr,
            vfr: weatherStats.vfr,
            mvfr: weatherStats.mvfr,
            ifr: weatherStats.ifr,
            lifr: weatherStats.lifr,
            lastUpdated: new Date(),
          }}
        />
      )}

      {/* Loading indicator for weather */}
      {loadingWeather && (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
          <p className="text-sm text-blue-700">Analyzing historical weather data...</p>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveFilter('all')}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
            activeFilter === 'all'
              ? "bg-zinc-900 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          )}
        >
          All ({weatherStats.total})
        </button>
        <button
          onClick={() => setActiveFilter('logbook')}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
            activeFilter === 'logbook'
              ? "bg-blue-600 text-white"
              : "bg-blue-50 text-blue-700 hover:bg-blue-100"
          )}
        >
          Logbook ({weatherStats.logbook})
        </button>
        <button
          onClick={() => setActiveFilter('planned')}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-all",
            activeFilter === 'planned'
              ? "bg-emerald-600 text-white"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          )}
        >
          Planned ({weatherStats.planned})
        </button>
      </div>

      {/* Flight List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {filteredFlights.length === 0 ? (
          <div className="p-8 text-center bg-zinc-50 rounded-lg">
            <Plane className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No flights found</p>
          </div>
        ) : (
          filteredFlights.map((item: any, idx: number) => (
            <FlightCard
              key={item._id || `logbook-${idx}`}
              item={item}
              isExpanded={expandedFlight === (item._id || `logbook-${idx}`)}
              onToggle={() => setExpandedFlight(
                expandedFlight === (item._id || `logbook-${idx}`) ? null : (item._id || `logbook-${idx}`)
              )}
              getFlightCategoryColor={getFlightCategoryColor}
              formatDate={formatDate}
              onPlayback={setPlaybackFlight}
            />
          ))
        )}
      </div>

      {/* Flight Playback Modal */}
      {playbackFlight && (
        <FlightPlaybackModal
          isOpen={!!playbackFlight}
          onClose={() => setPlaybackFlight(null)}
          flight={playbackFlight}
        />
      )}
    </div>
  );
}

// Flight Card Component
function FlightCard({
  item,
  isExpanded,
  onToggle,
  getFlightCategoryColor,
  formatDate,
  onPlayback,
}: {
  item: any;
  isExpanded: boolean;
  onToggle: () => void;
  getFlightCategoryColor: (category?: string) => string;
  formatDate: (date: Date | string) => string;
  onPlayback: (flight: any) => void;
}) {
  const isLogbook = item._type === 'logbook';
  const weather = item.weather;
  const departureAirport = isLogbook ? item.from : item.departureAirport;
  const arrivalAirport = isLogbook ? item.to : (item.arrivalAirport || item.departureAirport);
  const flightDate = isLogbook ? item.date : item.scheduledDate;
  const aircraftIdent = isLogbook ? item.aircraftIdent : null;
  const aircraft = !isLogbook && typeof item.aircraft === 'object' ? item.aircraft : null;

  return (
    <div className="bg-zinc-50 rounded-lg border border-zinc-200 overflow-hidden">
      {/* Flight Header */}
      <div
        className="p-3 cursor-pointer hover:bg-zinc-100 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-zinc-400" />
              <span className="font-medium text-zinc-900">{departureAirport}</span>
              <Navigation className="w-3 h-3 text-zinc-400 mx-1" />
              <span className="font-medium text-zinc-900">{arrivalAirport || departureAirport}</span>
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
            <span className="text-xs text-zinc-500">{formatDate(flightDate)}</span>
            <FlightPlaybackButton
              onClick={(e) => {
                e.stopPropagation();
                const tailNumber = isLogbook
                  ? item.aircraftIdent
                  : (item.aircraftTailNumber || aircraft?.tailNumber || null);
                onPlayback({
                  date: flightDate,
                  departureAirport: departureAirport,
                  arrivalAirport: arrivalAirport,
                  route: isLogbook ? item.route : item.route,
                  aircraftIdent: tailNumber,
                  totalTime: isLogbook ? item.totalTime : item.estimatedDuration,
                  remarks: isLogbook ? item.remarks : item.notes,
                });
              }}
              disabled={!(isLogbook ? item.aircraftIdent : (item.aircraftTailNumber || aircraft?.tailNumber))}
            />
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-zinc-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
          {aircraftIdent && (
            <span className="font-medium text-blue-600">{aircraftIdent}</span>
          )}
          {isLogbook && item.totalTime > 0 && (
            <span>{item.totalTime}h total</span>
          )}
        </div>
      </div>

      {/* Expanded Details */}
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
              {weather.metar && (
                <div className="mt-2 p-2 bg-zinc-100 rounded text-xs font-mono text-zinc-600 break-all">
                  {weather.metar}
                </div>
              )}
            </div>
          ) : (
            <div className="mb-3 p-3 bg-zinc-50 rounded text-center">
              <Cloud className="w-6 h-6 text-zinc-300 mx-auto mb-1" />
              <p className="text-xs text-zinc-500">No weather data recorded</p>
            </div>
          )}

          {/* Remarks */}
          {isLogbook && item.remarks && (
            <div className="mt-3 pt-3 border-t border-zinc-100">
              <p className="text-xs text-zinc-500 font-medium mb-1">Remarks</p>
              <p className="text-sm text-zinc-700">{item.remarks}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Safety Tab Component
function SafetyTab({
  pilot,
  isGeneratingAnalysis,
  setIsGeneratingAnalysis,
  generateSafetyAnalysis,
  refetch,
  weatherExperience,
}: {
  pilot: Pilot;
  isGeneratingAnalysis: boolean;
  setIsGeneratingAnalysis: (value: boolean) => void;
  generateSafetyAnalysis: any;
  refetch: () => void;
  weatherExperience?: WeatherExperience;
}) {
  // Auto-generate safety analysis when pilot is selected without one
  useEffect(() => {
    if (!pilot.safetyAnalysis && !isGeneratingAnalysis) {
      setIsGeneratingAnalysis(true);
      generateSafetyAnalysis.mutate(pilot._id, {
        onSuccess: () => {
          refetch();
          setIsGeneratingAnalysis(false);
        },
        onError: () => {
          setIsGeneratingAnalysis(false);
        },
      });
    }
  }, [pilot._id, pilot.safetyAnalysis]);

  const handleRegenerate = () => {
    setIsGeneratingAnalysis(true);
    generateSafetyAnalysis.mutate(pilot._id, {
      onSuccess: () => {
        refetch();
        setIsGeneratingAnalysis(false);
      },
      onError: () => setIsGeneratingAnalysis(false),
    });
  };

  if (isGeneratingAnalysis) {
    return (
      <div className="p-8 text-center">
        <RefreshCw className="w-10 h-10 text-blue-500 mx-auto mb-3 animate-spin" />
        <p className="text-zinc-600 font-medium">Generating Safety Analysis...</p>
        <p className="text-sm text-zinc-500 mt-1">Analyzing pilot profile, currency, and weather experience</p>
      </div>
    );
  }

  if (!pilot.safetyAnalysis) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
        <p className="text-zinc-600 font-medium">No Safety Analysis Available</p>
        <p className="text-sm text-zinc-500 mt-1">Generate an analysis to assess pilot risk factors</p>
        <Button onClick={handleRegenerate} className="mt-4">
          <Shield className="w-4 h-4 mr-2" />
          Generate Analysis
        </Button>
      </div>
    );
  }

  const { score, findings } = pilot.safetyAnalysis;
  const scoreColor = score > 7 ? 'emerald' : score > 4 ? 'amber' : 'red';

  return (
    <div className="space-y-6">
      {/* Score Card */}
      <div className={cn(
        "rounded-lg p-6 border",
        scoreColor === 'emerald' ? "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200" :
        scoreColor === 'amber' ? "bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200" :
        "bg-gradient-to-br from-red-50 to-red-100 border-red-200"
      )}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Shield className={cn(
              "w-8 h-8",
              scoreColor === 'emerald' ? "text-emerald-600" :
              scoreColor === 'amber' ? "text-amber-600" : "text-red-600"
            )} />
            <div>
              <h3 className="font-semibold text-zinc-900">Risk Assessment Score</h3>
              <p className="text-sm text-zinc-600">
                Based on currency, experience, and weather history
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={cn(
              "text-4xl font-bold",
              scoreColor === 'emerald' ? "text-emerald-700" :
              scoreColor === 'amber' ? "text-amber-700" : "text-red-700"
            )}>
              {score}/10
            </p>
            <p className="text-sm text-zinc-500">
              {score > 7 ? 'Low Risk' : score > 4 ? 'Medium Risk' : 'High Risk'}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRegenerate}
          disabled={isGeneratingAnalysis}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Regenerate Analysis
        </Button>
      </div>

      {/* Weather Experience Factor */}
      {weatherExperience && weatherExperience.flightsWithWeather >= 3 && (
        <div className="bg-sky-50 rounded-lg p-4 border border-sky-200">
          <div className="flex items-center gap-2 mb-3">
            <Cloud className="w-5 h-5 text-sky-600" />
            <h4 className="font-medium text-sky-900">Weather Experience Factor</h4>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold text-emerald-600">
                {Math.round((weatherExperience.vfr / weatherExperience.flightsWithWeather) * 100)}%
              </p>
              <p className="text-xs text-zinc-600">VFR Experience</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {Math.round((weatherExperience.mvfr / weatherExperience.flightsWithWeather) * 100)}%
              </p>
              <p className="text-xs text-zinc-600">MVFR Experience</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">
                {Math.round(((weatherExperience.ifr + weatherExperience.lifr) / weatherExperience.flightsWithWeather) * 100)}%
              </p>
              <p className="text-xs text-zinc-600">IFR/LIFR Experience</p>
            </div>
          </div>
          <p className="text-sm text-sky-700 mt-3">
            {weatherExperience.vfr / weatherExperience.flightsWithWeather >= 0.9
              ? 'Primarily VFR pilot. Extra caution recommended in marginal conditions.'
              : weatherExperience.ifr / weatherExperience.flightsWithWeather >= 0.2
              ? 'Experienced with instrument conditions.'
              : 'Good mix of weather experience.'}
          </p>
        </div>
      )}

      {/* Findings */}
      <div>
        <h4 className="font-semibold text-zinc-900 mb-3">Analysis Findings</h4>
        <div className="space-y-2">
          {findings?.map((finding: any, idx: number) => (
            <div
              key={idx}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border",
                finding.riskLevel === 'low' ? "bg-emerald-50 border-emerald-200" :
                finding.riskLevel === 'medium' ? "bg-amber-50 border-amber-200" :
                "bg-red-50 border-red-200"
              )}
            >
              {finding.riskLevel === 'low' ? (
                <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : finding.riskLevel === 'medium' ? (
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded",
                    finding.riskLevel === 'low' ? "bg-emerald-200 text-emerald-800" :
                    finding.riskLevel === 'medium' ? "bg-amber-200 text-amber-800" :
                    "bg-red-200 text-red-800"
                  )}>
                    {finding.category}
                  </span>
                </div>
                <p className="text-sm text-zinc-700">{finding.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Documents Tab Component
function DocumentsTab({ pilotId }: { pilotId: string }) {
  const { data: documents, isLoading } = useParsedDocuments({ pilotId });

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <RefreshCw className="w-8 h-8 text-zinc-400 mx-auto animate-spin" />
      </div>
    );
  }

  const linkedDocs = documents?.filter((doc: any) => doc.status === 'completed') || [];

  if (linkedDocs.length === 0) {
    return (
      <div className="p-8 text-center">
        <FileText className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
        <p className="text-zinc-600 font-medium">No Documents Linked</p>
        <p className="text-sm text-zinc-500 mt-1">
          Upload pilot logbooks from the Files page and link them to this pilot
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-zinc-900">Linked Documents</h4>
        <Badge variant="secondary">{linkedDocs.length} documents</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {linkedDocs.map((doc: any) => {
          const entries = doc.entries || [];

          return (
            <div
              key={doc._id}
              className="bg-zinc-50 rounded-lg border border-zinc-200 p-4 hover:border-zinc-300 transition-colors"
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
    </div>
  );
}

// Add Pilot Modal
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
