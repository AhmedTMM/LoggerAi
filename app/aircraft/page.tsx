'use client';

import { useState } from 'react';
import { Plane, Plus, AlertTriangle, CheckCircle, Wrench, Trash2, RefreshCw } from 'lucide-react';
import { useAircraft, useCreateAircraft, useDeleteAircraft } from '@/lib/hooks';
import type { Aircraft } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSkeleton';
import { cn, getDaysUntil } from '@/lib/utils';

export default function AircraftPage() {
  const { data: fleet, isLoading, error, refetch } = useAircraft();
  const createAircraft = useCreateAircraft();
  const deleteAircraft = useDeleteAircraft();

  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const getMaintenanceStatus = (date: Date | string) => {
    const days = getDaysUntil(date);
    if (days < 0) return { color: 'text-red-500', badge: 'destructive', text: 'Overdue' };
    if (days < 30) return { color: 'text-amber-500', badge: 'warning', text: `${days}d left` };
    return { color: 'text-emerald-500', badge: 'success', text: 'Current' };
  };

  if (isLoading) return <LoadingSpinner className="h-96" />;
  if (error) return (
    <div className="text-center py-12">
      <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
      <p className="text-zinc-600 dark:text-zinc-400">Failed to load aircraft</p>
    </div>
  );

  const maintenanceDue = fleet?.filter(ac => getDaysUntil(ac.maintenanceDates?.annual) < 30).length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Aircraft</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Manage your fleet</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Aircraft
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Total Aircraft</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{fleet?.length || 0}</p>
        </div>
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Maintenance Due</p>
          <p className={cn("text-2xl font-bold", maintenanceDue > 0 ? "text-amber-500" : "text-zinc-900 dark:text-zinc-100")}>
            {maintenanceDue}
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Total Hours</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {fleet?.reduce((acc, curr) => acc + (curr.currentHours?.hobbs || 0), 0).toFixed(0) || '0'}
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">All Current</p>
          <p className="text-2xl font-bold text-emerald-500">
            {(fleet?.length || 0) - maintenanceDue}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Aircraft List */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Fleet</h3>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {fleet?.map((ac) => {
                const isSelected = selectedAircraft?._id === ac._id;
                const annualStatus = getMaintenanceStatus(ac.maintenanceDates?.annual);

                return (
                  <div
                    key={ac._id}
                    onClick={() => setSelectedAircraft(ac)}
                    className={cn(
                      "p-4 border-b border-zinc-100 dark:border-zinc-700 cursor-pointer transition-colors",
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-900/30"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-zinc-900 dark:text-zinc-100">{ac.tailNumber}</span>
                      {getDaysUntil(ac.maintenanceDates?.annual) < 30 && (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      )}
                    </div>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">{ac.model}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <span>{ac.currentHours?.hobbs?.toFixed(0) || 0} hrs</span>
                      <span className={annualStatus.color}>Annual: {annualStatus.text}</span>
                    </div>
                  </div>
                );
              })}
              {(!fleet || fleet.length === 0) && (
                <div className="p-8 text-center">
                  <Plane className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-500 dark:text-zinc-400">No aircraft added yet</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Aircraft
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Aircraft Details */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 min-h-[500px]">
            {selectedAircraft ? (
              <div className="h-full flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                        <Plane className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{selectedAircraft.tailNumber}</h2>
                        <p className="text-zinc-500 dark:text-zinc-400">{selectedAircraft.year} {selectedAircraft.manufacturer} {selectedAircraft.model}</p>
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
                  {/* Times */}
                  <div>
                    <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Aircraft Times</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase">Hobbs</p>
                        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{selectedAircraft.currentHours?.hobbs?.toFixed(1) || 0}</p>
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 uppercase">Tach</p>
                        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{selectedAircraft.currentHours?.tach?.toFixed(1) || 0}</p>
                      </div>
                    </div>
                  </div>

                  {/* Maintenance */}
                  <div>
                    <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
                      <Wrench className="w-4 h-4" /> Maintenance Status
                    </h4>
                    <div className="space-y-3">
                      {[
                        { label: 'Annual Inspection', date: selectedAircraft.maintenanceDates?.annual },
                        { label: 'Transponder Check', date: selectedAircraft.maintenanceDates?.transponder },
                        { label: 'Pitot-Static', date: selectedAircraft.maintenanceDates?.staticSystem },
                      ].filter(item => item.date).map((item) => {
                        const status = getMaintenanceStatus(item.date!);
                        return (
                          <div key={item.label} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                            <span className="text-zinc-700 dark:text-zinc-300">{item.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                                {new Date(item.date!).toLocaleDateString()}
                              </span>
                              <Badge variant={status.badge as any}>{status.text}</Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Details */}
                  <div>
                    <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Details</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                        <p className="text-zinc-500 dark:text-zinc-400">Serial</p>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{selectedAircraft.serial || 'N/A'}</p>
                      </div>
                      <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                        <p className="text-zinc-500 dark:text-zinc-400">Year</p>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{selectedAircraft.year || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <Plane className="w-12 h-12 text-zinc-300 dark:text-zinc-600 mb-4" />
                <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">No Aircraft Selected</h3>
                <p className="text-zinc-500 dark:text-zinc-400 mt-2">Select an aircraft to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <AddAircraftModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            refetch();
          }}
          createAircraft={createAircraft}
        />
      )}

      {/* Delete Modal */}
      {showDeleteModal && selectedAircraft && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">Delete Aircraft?</h3>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              Are you sure you want to delete {selectedAircraft.tailNumber}?
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  deleteAircraft.mutate(selectedAircraft._id as string, {
                    onSuccess: () => {
                      setShowDeleteModal(false);
                      setSelectedAircraft(null);
                      refetch();
                    }
                  });
                }}
                disabled={deleteAircraft.isPending}
                className="flex-1"
              >
                {deleteAircraft.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddAircraftModal({
  onClose,
  onCreated,
  createAircraft,
}: {
  onClose: () => void;
  onCreated: () => void;
  createAircraft: any;
}) {
  const [formData, setFormData] = useState({
    tailNumber: '',
    model: '',
    manufacturer: '',
    year: new Date().getFullYear(),
    serial: '',
    hobbs: 0,
    tach: 0,
    annual: new Date().toISOString().split('T')[0],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAircraft.mutate({
      tailNumber: formData.tailNumber,
      model: formData.model,
      manufacturer: formData.manufacturer,
      year: formData.year,
      serial: formData.serial,
      currentHours: {
        hobbs: formData.hobbs,
        tach: formData.tach,
      },
      maintenanceDates: {
        annual: formData.annual,
        transponder: formData.annual,
        staticSystem: formData.annual,
      },
    }, {
      onSuccess: onCreated,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">Add Aircraft</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Tail Number</label>
              <input
                type="text"
                value={formData.tailNumber}
                onChange={(e) => setFormData({ ...formData, tailNumber: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 uppercase"
                placeholder="N12345"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Model</label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                placeholder="172S"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Manufacturer</label>
              <input
                type="text"
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                placeholder="Cessna"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Year</label>
              <input
                type="number"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Serial Number</label>
            <input
              type="text"
              value={formData.serial}
              onChange={(e) => setFormData({ ...formData, serial: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Hobbs Time</label>
              <input
                type="number"
                step="0.1"
                value={formData.hobbs}
                onChange={(e) => setFormData({ ...formData, hobbs: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Tach Time</label>
              <input
                type="number"
                step="0.1"
                value={formData.tach}
                onChange={(e) => setFormData({ ...formData, tach: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Annual Due Date</label>
            <input
              type="date"
              value={formData.annual}
              onChange={(e) => setFormData({ ...formData, annual: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={createAircraft.isPending} className="flex-1">
              {createAircraft.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Aircraft
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
