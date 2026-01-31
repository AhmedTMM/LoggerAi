'use client';

import { useState } from 'react';
import { Plus, Play, AlertTriangle, CheckCircle, XCircle, Plane, RefreshCw, Calendar, MapPin, ArrowRight, Mail } from 'lucide-react';
import { useFlights, useRunFlightAudit, usePilots, useAircraft } from '@/lib/hooks';
import type { Flight } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSkeleton';
import { cn, formatDateTime } from '@/lib/utils';

export default function FlightsPage() {
  const { data: flights, isLoading, error, refetch } = useFlights();
  const { data: pilots } = usePilots();
  const { data: aircraft } = useAircraft();
  const runAudit = useRunFlightAudit();
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [showNewFlightModal, setShowNewFlightModal] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const handleSendEmail = async (flightId: string) => {
    setIsSendingEmail(true);
    try {
      const res = await fetch(`/api/audit/email/${flightId}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('Email sent successfully!');
      } else {
        alert('Failed to send email: ' + data.message);
      }
    } catch (err) {
      alert('Error sending email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleRunAudit = (flightId: string) => runAudit.mutate(flightId, { onSuccess: (data) => setSelectedFlight(data) });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'go': return 'bg-emerald-500';
      case 'caution': return 'bg-amber-500';
      case 'no-go': return 'bg-red-500';
      default: return 'bg-zinc-400';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'go': return <Badge variant="success">GO</Badge>;
      case 'caution': return <Badge variant="warning">CAUTION</Badge>;
      case 'no-go': return <Badge variant="destructive">NO-GO</Badge>;
      default: return <Badge variant="secondary">PENDING</Badge>;
    }
  };

  if (isLoading) return <LoadingSpinner className="h-96" />;
  if (error) return (
    <div className="text-center py-12">
      <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
      <p className="text-zinc-600 dark:text-zinc-400">Failed to load flights</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Flights</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Manage and analyze your flights</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowNewFlightModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Flight
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Flight List */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <div className="p-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">All Flights</h3>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {flights?.map((flight) => {
                const pilot = flight.pilot as any;
                const aircraftData = flight.aircraft as any;
                const isSelected = selectedFlight?._id === flight._id;

                return (
                  <div
                    key={flight._id}
                    onClick={() => setSelectedFlight(flight)}
                    className={cn(
                      "p-4 border-b border-zinc-100 dark:border-zinc-700 cursor-pointer transition-colors",
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-900/30"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", getStatusColor(flight.overallStatus))} />
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">{aircraftData?.tailNumber}</span>
                      </div>
                      {getStatusBadge(flight.overallStatus)}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <MapPin className="w-3 h-3" />
                      <span>{flight.departureAirport}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span>{flight.arrivalAirport || 'Local'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-500 mt-1">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDateTime(flight.scheduledDate, (flight as any).scheduledTime)}</span>
                    </div>
                    {pilot?.name && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Pilot: {pilot.name}</p>
                    )}
                  </div>
                );
              })}
              {(!flights || flights.length === 0) && (
                <div className="p-8 text-center">
                  <Plane className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-500 dark:text-zinc-400">No flights yet</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowNewFlightModal(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Flight
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Flight Details */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 min-h-[600px]">
            {selectedFlight ? (
              <div className="h-full flex flex-col">
                {/* Detail Header */}
                <div className="p-6 border-b border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusBadge(selectedFlight.overallStatus)}
                      </div>
                      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                        {(selectedFlight.aircraft as any)?.tailNumber} Flight
                      </h2>
                      <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                        <span>{(selectedFlight.pilot as any)?.name}</span>
                        <span>{formatDateTime(selectedFlight.scheduledDate, (selectedFlight as any).scheduledTime)}</span>
                        <span className="font-mono">{selectedFlight.departureAirport} → {selectedFlight.arrivalAirport || 'Local'}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleRunAudit(selectedFlight._id)}
                        disabled={runAudit.isPending}
                      >
                        {runAudit.isPending ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4 mr-2" />
                        )}
                        Run Audit
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleSendEmail(selectedFlight._id)}
                        disabled={isSendingEmail}
                      >
                        {isSendingEmail ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Mail className="w-4 h-4 mr-2" />
                        )}
                        Send Email
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Detail Content */}
                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                  {/* Safety Summary */}
                  {selectedFlight.safetyAnalysisSnapshot && (selectedFlight.safetyAnalysisSnapshot as any).reasoning && (
                    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
                      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Safety Analysis</h4>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {(selectedFlight.safetyAnalysisSnapshot as any).reasoning}
                      </p>
                    </div>
                  )}

                  {/* Compliance Checks */}
                  {selectedFlight.legalityChecks && selectedFlight.legalityChecks.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Compliance Checks</h4>
                      <div className="space-y-2">
                        {selectedFlight.legalityChecks.map((check, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg"
                          >
                            {check.status === 'pass' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                            {check.status === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                            {check.status === 'fail' && <XCircle className="w-5 h-5 text-red-500" />}
                            <div className="flex-1">
                              <p className="font-medium text-zinc-900 dark:text-zinc-100">{check.item}</p>
                              <p className="text-sm text-zinc-500 dark:text-zinc-400">{check.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Weather Info */}
                  {selectedFlight.weather && (
                    <div>
                      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Weather</h4>
                      <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4">
                        <div className="flex items-center gap-4 mb-3">
                          <Badge variant={
                            selectedFlight.weather.flightCategory === 'VFR' ? 'success' :
                              selectedFlight.weather.flightCategory === 'MVFR' ? 'warning' : 'destructive'
                          }>
                            {selectedFlight.weather.flightCategory}
                          </Badge>
                          <span className="text-sm text-zinc-600 dark:text-zinc-400">
                            Wind: {selectedFlight.weather.wind?.speed || 0}kt | Visibility: {selectedFlight.weather.visibility}SM
                          </span>
                        </div>
                        <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 break-all">
                          {selectedFlight.weather.metar}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* No audit message */}
                  {!selectedFlight.legalityChecks?.length && !selectedFlight.weather && (
                    <div className="text-center py-8">
                      <p className="text-zinc-500 dark:text-zinc-400">Click "Run Audit" to analyze this flight</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <Plane className="w-12 h-12 text-zinc-300 dark:text-zinc-600 mb-4" />
                <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">No Flight Selected</h3>
                <p className="text-zinc-500 dark:text-zinc-400 mt-2">Select a flight to view details and run analysis</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Flight Modal */}
      {showNewFlightModal && (
        <NewFlightModal
          pilots={pilots || []}
          aircraft={aircraft || []}
          onClose={() => setShowNewFlightModal(false)}
          onCreated={(flight) => {
            setShowNewFlightModal(false);
            refetch();
            setSelectedFlight(flight);
          }}
        />
      )}
    </div>
  );
}

function NewFlightModal({
  pilots,
  aircraft,
  onClose,
  onCreated,
}: {
  pilots: any[];
  aircraft: any[];
  onClose: () => void;
  onCreated: (flight: any) => void;
}) {
  const [formData, setFormData] = useState({
    pilotId: '',
    aircraftId: '',
    scheduledDate: new Date().toISOString().split('T')[0],
    scheduledTime: '',
    departureAirport: '',
    arrivalAirport: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/flights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pilot: formData.pilotId,
          aircraft: formData.aircraftId,
          scheduledDate: formData.scheduledDate,
          scheduledTime: formData.scheduledTime || undefined,
          departureAirport: formData.departureAirport,
          arrivalAirport: formData.arrivalAirport || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        onCreated(data.data);
      } else {
        alert('Failed to create flight: ' + data.error);
      }
    } catch (err) {
      alert('Error creating flight');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">New Flight</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Pilot</label>
            <select
              value={formData.pilotId}
              onChange={(e) => setFormData({ ...formData, pilotId: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              required
            >
              <option value="">Select pilot...</option>
              {pilots.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Aircraft</label>
            <select
              value={formData.aircraftId}
              onChange={(e) => setFormData({ ...formData, aircraftId: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              required
            >
              <option value="">Select aircraft...</option>
              {aircraft.map((a) => (
                <option key={a._id} value={a._id}>{a.tailNumber} - {a.model}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Date</label>
              <input
                type="date"
                value={formData.scheduledDate}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Time</label>
              <input
                type="time"
                value={formData.scheduledTime}
                onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">From</label>
              <input
                type="text"
                value={formData.departureAirport}
                onChange={(e) => setFormData({ ...formData, departureAirport: e.target.value.toUpperCase() })}
                placeholder="KJFK"
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 uppercase font-mono"
                maxLength={4}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">To</label>
              <input
                type="text"
                value={formData.arrivalAirport}
                onChange={(e) => setFormData({ ...formData, arrivalAirport: e.target.value.toUpperCase() })}
                placeholder="KBOS"
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 uppercase font-mono"
                maxLength={4}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
