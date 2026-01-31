'use client';

import { useState } from 'react';
import { User, Plus, Clock, AlertTriangle, CheckCircle, Trash2, RefreshCw, Shield, Award, Mail, Save } from 'lucide-react';
import { usePilots, useCreatePilot, useDeletePilot } from '@/lib/hooks';
import type { Pilot } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSkeleton';
import { cn, getDaysUntil } from '@/lib/utils';

export default function PilotsPage() {
  const { data: pilots, isLoading, error, refetch } = usePilots();
  const createPilot = useCreatePilot();
  const deletePilot = useDeletePilot();

  const [selectedPilot, setSelectedPilot] = useState<Pilot | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingEmail, setEditingEmail] = useState('');
  const [isSavingEmail, setIsSavingEmail] = useState(false);

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
        alert('Email saved!');
      } else {
        alert('Failed to save email: ' + data.error);
      }
    } catch (err) {
      alert('Error saving email');
    } finally {
      setIsSavingEmail(false);
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
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{selectedPilot.name}</h2>
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
                      {[
                        { label: 'Medical', date: selectedPilot.medicalExpiration },
                        { label: 'Flight Review', date: selectedPilot.flightReviewExpiration },
                      ].map((item) => {
                        const status = getExpirationStatus(item.date);
                        return (
                          <div key={item.label} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                            <span className="text-zinc-700 dark:text-zinc-300">{item.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                                {new Date(item.date).toLocaleDateString()}
                              </span>
                              <Badge variant={status.badge as any}>{status.text}</Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Safety Score */}
                  {selectedPilot.safetyAnalysis && (
                    <div>
                      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                        <Shield className="w-4 h-4" /> Safety Analysis
                      </h4>
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
                            <span className="text-zinc-600 dark:text-zinc-400">{finding.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
