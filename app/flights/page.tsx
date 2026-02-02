'use client';

import { useState } from 'react';
import { Plus, Play, AlertTriangle, CheckCircle, XCircle, Plane, RefreshCw, Calendar, MapPin, ArrowRight, Trash2, Bot } from 'lucide-react';
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
  const [auditProgress, setAuditProgress] = useState<string | null>(null);

  const handleWipeFlights = async () => {
    if (!confirm('Are you sure you want to delete ALL flights? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/flights/wipe', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert(`Deleted ${data.deletedCount} flights`);
        setSelectedFlight(null);
        refetch();
      } else {
        alert('Failed to wipe flights: ' + data.error);
      }
    } catch (err) {
      alert('Error wiping flights');
    }
  };

  const handleRunAudit = async (flightId: string) => {
    // Step 1: Run standard audit
    setAuditProgress('Running safety audit...');
    runAudit.mutate(flightId, {
      onSuccess: async (data) => {
        setSelectedFlight(data);

        // Step 2: Run AI analysis
        setAuditProgress('Running AI analysis...');
        try {
          const res = await fetch(`/api/flights/${flightId}/ai-analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sendEmail: true }),
          });
          const aiData = await res.json();

          if (aiData.success) {
            setAuditProgress(null);
            refetch();
            // Update selected flight with AI data
            const updatedFlight = await fetch(`/api/flights/${flightId}`).then(r => r.json());
            if (updatedFlight.success) {
              setSelectedFlight(updatedFlight.data);
            }

            // Email sent silently - no alert needed
            console.log(aiData.data.emailSent ? 'Email sent successfully' : aiData.data.emailMessage);
          } else {
            setAuditProgress(null);
            // AI failed but standard audit succeeded - that's OK
            console.warn('AI analysis failed:', aiData.error);
          }
        } catch (err) {
          setAuditProgress(null);
          console.error('AI analysis error:', err);
        }
      },
      onError: () => {
        setAuditProgress(null);
      }
    });
  };

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
      <p className="text-zinc-600">Failed to load flights</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Flights</h1>
          <p className="text-zinc-500">Manage and analyze your flights</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleWipeFlights} className="text-red-600 hover:text-red-700 hover:bg-red-50">
            <Trash2 className="w-4 h-4 mr-2" />
            Wipe All
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
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="p-3 border-b border-zinc-200 bg-zinc-50">
              <h3 className="font-semibold text-zinc-900">All Flights</h3>
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
                      "p-4 border-b border-zinc-100 cursor-pointer transition-colors",
                      isSelected
                        ? "bg-blue-50"
                        : "hover:bg-zinc-50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", getStatusColor(flight.overallStatus))} />
                        <span className="font-bold text-zinc-900">{aircraftData?.tailNumber}</span>
                      </div>
                      {getStatusBadge(flight.overallStatus)}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-600">
                      <MapPin className="w-3 h-3" />
                      <span>{flight.departureAirport}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span>{flight.arrivalAirport || 'Local'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-500 mt-1">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDateTime(flight.scheduledDate, (flight as any).scheduledTime)}</span>
                    </div>
                    {pilot?.name && (
                      <p className="text-xs text-zinc-400 mt-1">Pilot: {pilot.name}</p>
                    )}
                  </div>
                );
              })}
              {(!flights || flights.length === 0) && (
                <div className="p-8 text-center">
                  <Plane className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                  <p className="text-zinc-500">No flights yet</p>
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
          <div className="bg-white rounded-xl border border-zinc-200 min-h-[600px]">
            {selectedFlight ? (
              <div className="h-full flex flex-col">
                {/* Detail Header */}
                <div className="p-6 border-b border-zinc-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusBadge(selectedFlight.overallStatus)}
                      </div>
                      <h2 className="text-xl font-bold text-zinc-900">
                        {(selectedFlight.aircraft as any)?.tailNumber} Flight
                      </h2>
                      <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500">
                        <span>{(selectedFlight.pilot as any)?.name}</span>
                        <span>{formatDateTime(selectedFlight.scheduledDate, (selectedFlight as any).scheduledTime)}</span>
                        <span className="font-mono">{selectedFlight.departureAirport} → {selectedFlight.arrivalAirport || 'Local'}</span>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleRunAudit(selectedFlight._id)}
                      disabled={runAudit.isPending || !!auditProgress}
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                    >
                      {runAudit.isPending || auditProgress ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          {auditProgress || 'Running...'}
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Run Full Audit
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Detail Content */}
                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                  {/* Audit Progress */}
                  {auditProgress && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <Bot className="w-10 h-10 text-blue-600" />
                          <div className="absolute -top-1 -right-1">
                            <span className="flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                            </span>
                          </div>
                        </div>
                        <div>
                          <h4 className="font-semibold text-blue-900">{auditProgress}</h4>
                          <p className="text-sm text-blue-700">
                            {auditProgress.includes('AI') ? 'Analyzing weather, pilot qualifications, aircraft status, and risk factors...' : 'Checking compliance, weather, and generating risk scenarios...'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 h-2 bg-blue-200 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full animate-pulse" style={{width: auditProgress.includes('AI') ? '80%' : '40%'}} />
                      </div>
                    </div>
                  )}

                  {/* AI Analysis Results */}
                  {(selectedFlight.safetyAnalysisSnapshot as any)?.aiAnalysis?.summary && !auditProgress && (
                    <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Bot className="w-5 h-5 text-violet-600" />
                        <h4 className="font-semibold text-violet-900">AI Safety Analysis</h4>
                        {(selectedFlight.safetyAnalysisSnapshot as any)?.aiAnalysis?.confidenceLevel && (
                          <Badge className="bg-violet-100 text-violet-700">
                            {(selectedFlight.safetyAnalysisSnapshot as any)?.aiAnalysis?.confidenceLevel}% confidence
                          </Badge>
                        )}
                      </div>

                      {/* AI Summary */}
                      {(selectedFlight.safetyAnalysisSnapshot as any)?.aiAnalysis?.summary && (
                        <div className="bg-white/50 rounded-lg p-3 mb-3">
                          <p className="text-sm text-zinc-700">
                            {(selectedFlight.safetyAnalysisSnapshot as any)?.aiAnalysis?.summary}
                          </p>
                        </div>
                      )}

                      {/* AI Key Risks */}
                      {(selectedFlight.safetyAnalysisSnapshot as any)?.aiAnalysis?.keyRisks?.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs font-semibold text-violet-800 mb-2">Key Risks:</p>
                          <div className="space-y-2">
                            {(selectedFlight.safetyAnalysisSnapshot as any)?.aiAnalysis?.keyRisks.slice(0, 3).map((risk: any, idx: number) => (
                              <div key={idx} className="flex items-start gap-2 text-xs">
                                <span className={cn(
                                  "px-2 py-0.5 rounded-full text-white font-medium",
                                  risk.severity === 'critical' ? 'bg-red-500' :
                                  risk.severity === 'high' ? 'bg-orange-500' :
                                  risk.severity === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
                                )}>
                                  {risk.severity}
                                </span>
                                <span className="text-zinc-700">{risk.risk}: {risk.explanation}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* AI Recommendations */}
                      {(selectedFlight.safetyAnalysisSnapshot as any)?.aiAnalysis?.recommendations?.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs font-semibold text-violet-800 mb-2">Recommended Actions:</p>
                          <div className="space-y-2">
                            {(selectedFlight.safetyAnalysisSnapshot as any)?.aiAnalysis?.recommendations.slice(0, 3).map((rec: any, idx: number) => (
                              <div key={idx} className="flex items-start gap-2 text-xs">
                                <span className={cn(
                                  "px-2 py-0.5 rounded-full font-medium",
                                  rec.priority === 'immediate' ? 'bg-red-100 text-red-700' :
                                  rec.priority === 'before_flight' ? 'bg-amber-100 text-amber-700' :
                                  'bg-blue-100 text-blue-700'
                                )}>
                                  {rec.priority.replace('_', ' ')}
                                </span>
                                <span className="text-zinc-700">{rec.action}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* AI Go/No-Go Reasoning */}
                      {(selectedFlight.safetyAnalysisSnapshot as any)?.aiAnalysis?.goNoGoReasoning && (
                        <div className="bg-white/50 rounded-lg p-3 mt-3">
                          <p className="text-xs font-semibold text-violet-800 mb-1">Decision Reasoning:</p>
                          <p className="text-xs text-zinc-600 line-clamp-3">
                            {(selectedFlight.safetyAnalysisSnapshot as any)?.aiAnalysis?.goNoGoReasoning}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Safety Summary */}
                  {selectedFlight.safetyAnalysisSnapshot && (selectedFlight.safetyAnalysisSnapshot as any).reasoning && !auditProgress && (
                    <div className="bg-zinc-50 rounded-lg p-4">
                      <h4 className="font-semibold text-zinc-900 mb-2">Safety Analysis</h4>
                      <p className="text-sm text-zinc-600">
                        {(selectedFlight.safetyAnalysisSnapshot as any).reasoning}
                      </p>
                    </div>
                  )}

                  {/* Survival Score Breakdown */}
                  {(selectedFlight.safetyAnalysisSnapshot as any)?.survivalScoreBreakdown && (
                    <div>
                      <h4 className="font-semibold text-zinc-900 mb-3">Survival Score Breakdown</h4>
                      <div className="bg-zinc-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-2xl font-bold text-zinc-900">
                            {(selectedFlight.safetyAnalysisSnapshot as any).survivalScoreBreakdown.totalScore}/100
                          </span>
                          <Badge variant={
                            (selectedFlight.safetyAnalysisSnapshot as any).survivalScoreBreakdown.totalScore >= 70 ? 'success' :
                            (selectedFlight.safetyAnalysisSnapshot as any).survivalScoreBreakdown.totalScore >= 50 ? 'warning' : 'destructive'
                          }>
                            {(selectedFlight.safetyAnalysisSnapshot as any).survivalScoreBreakdown.survivalProbability}
                          </Badge>
                        </div>
                        <div className="space-y-3">
                          {[
                            { label: 'Aircraft', score: (selectedFlight.safetyAnalysisSnapshot as any).survivalScoreBreakdown.aircraftScore, max: 25 },
                            { label: 'Pilot', score: (selectedFlight.safetyAnalysisSnapshot as any).survivalScoreBreakdown.pilotScore, max: 25 },
                            { label: 'Weather', score: (selectedFlight.safetyAnalysisSnapshot as any).survivalScoreBreakdown.weatherScore, max: 20 },
                            { label: 'Familiarity', score: (selectedFlight.safetyAnalysisSnapshot as any).survivalScoreBreakdown.familiarityScore, max: 15 },
                            { label: 'Failure Risk', score: (selectedFlight.safetyAnalysisSnapshot as any).survivalScoreBreakdown.failureProbScore, max: 15 },
                          ].map((item) => (
                            <div key={item.label}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-zinc-600">{item.label}</span>
                                <span className="font-medium text-zinc-900">{item.score}/{item.max}</span>
                              </div>
                              <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    item.score / item.max >= 0.7 ? 'bg-emerald-500' :
                                    item.score / item.max >= 0.5 ? 'bg-amber-500' : 'bg-red-500'
                                  )}
                                  style={{ width: `${(item.score / item.max) * 100}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Familiarity Analysis */}
                  {(selectedFlight.safetyAnalysisSnapshot as any)?.familiarityAnalysis && (
                    <div>
                      <h4 className="font-semibold text-zinc-900 mb-3">Pilot Familiarity</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-zinc-50 rounded-lg p-4">
                          <p className="text-xs text-zinc-500 mb-1">Aircraft Familiarity</p>
                          <Badge variant={
                            (selectedFlight.safetyAnalysisSnapshot as any).familiarityAnalysis.aircraftFamiliarity.familiarityLevel === 'high' ? 'success' :
                            (selectedFlight.safetyAnalysisSnapshot as any).familiarityAnalysis.aircraftFamiliarity.familiarityLevel === 'moderate' ? 'default' :
                            (selectedFlight.safetyAnalysisSnapshot as any).familiarityAnalysis.aircraftFamiliarity.familiarityLevel === 'low' ? 'warning' : 'destructive'
                          }>
                            {(selectedFlight.safetyAnalysisSnapshot as any).familiarityAnalysis.aircraftFamiliarity.familiarityLevel}
                          </Badge>
                          <p className="text-xs text-zinc-500 mt-2">
                            {(selectedFlight.safetyAnalysisSnapshot as any).familiarityAnalysis.aircraftFamiliarity.hoursInType.toFixed(1)} hrs in type •
                            {(selectedFlight.safetyAnalysisSnapshot as any).familiarityAnalysis.aircraftFamiliarity.tailNumberFlights} flights in tail
                          </p>
                        </div>
                        <div className="bg-zinc-50 rounded-lg p-4">
                          <p className="text-xs text-zinc-500 mb-1">Route Familiarity</p>
                          <Badge variant={
                            (selectedFlight.safetyAnalysisSnapshot as any).familiarityAnalysis.routeFamiliarity.familiarityLevel === 'high' ? 'success' :
                            (selectedFlight.safetyAnalysisSnapshot as any).familiarityAnalysis.routeFamiliarity.familiarityLevel === 'moderate' ? 'default' :
                            (selectedFlight.safetyAnalysisSnapshot as any).familiarityAnalysis.routeFamiliarity.familiarityLevel === 'low' ? 'warning' : 'destructive'
                          }>
                            {(selectedFlight.safetyAnalysisSnapshot as any).familiarityAnalysis.routeFamiliarity.familiarityLevel}
                          </Badge>
                          <p className="text-xs text-zinc-500 mt-2">
                            {(selectedFlight.safetyAnalysisSnapshot as any).familiarityAnalysis.routeFamiliarity.departureVisits} departure visits •
                            {(selectedFlight.safetyAnalysisSnapshot as any).familiarityAnalysis.routeFamiliarity.arrivalVisits} arrival visits
                          </p>
                        </div>
                      </div>
                      {(selectedFlight.safetyAnalysisSnapshot as any).familiarityAnalysis.riskFactors?.length > 0 && (
                        <div className="mt-3 p-3 bg-amber-50/20 border border-amber-200 rounded-lg">
                          <p className="text-xs font-medium text-amber-800 mb-1">Familiarity Concerns:</p>
                          <ul className="text-xs text-amber-700 space-y-1">
                            {(selectedFlight.safetyAnalysisSnapshot as any).familiarityAnalysis.riskFactors.map((rf: string, idx: number) => (
                              <li key={idx}>• {rf}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Risk Scenarios */}
                  {(selectedFlight.safetyAnalysisSnapshot as any)?.combinedRiskScenarios?.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-zinc-900 mb-3">Risk Scenarios</h4>
                      <div className="space-y-2">
                        {(selectedFlight.safetyAnalysisSnapshot as any).combinedRiskScenarios.slice(0, 5).map((scenario: any, idx: number) => (
                          <div
                            key={idx}
                            className={cn(
                              "p-3 rounded-lg border",
                              scenario.severity === 'critical' ? 'bg-red-50/20 border-red-200' :
                              scenario.severity === 'high' ? 'bg-orange-50 border-orange-200' :
                              scenario.severity === 'medium' ? 'bg-amber-50/20 border-amber-200' :
                              'bg-zinc-50 border-zinc-200'
                            )}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm text-zinc-900">{scenario.title}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-zinc-500">{scenario.probability}% risk</span>
                                <Badge variant={
                                  scenario.severity === 'critical' ? 'destructive' :
                                  scenario.severity === 'high' ? 'warning' :
                                  scenario.severity === 'medium' ? 'secondary' : 'default'
                                } className="text-xs">
                                  {scenario.severity}
                                </Badge>
                              </div>
                            </div>
                            <p className="text-xs text-zinc-600">{scenario.description}</p>
                            {scenario.mitigations?.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-zinc-200">
                                <p className="text-xs font-medium text-zinc-500 mb-1">Mitigations:</p>
                                <ul className="text-xs text-zinc-500">
                                  {scenario.mitigations.slice(0, 2).map((m: string, midx: number) => (
                                    <li key={midx}>• {m}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Compliance Checks */}
                  {selectedFlight.legalityChecks && selectedFlight.legalityChecks.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-zinc-900 mb-3">Compliance Checks</h4>
                      <div className="space-y-2">
                        {selectedFlight.legalityChecks.map((check, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg"
                          >
                            {check.status === 'pass' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                            {check.status === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
                            {check.status === 'fail' && <XCircle className="w-5 h-5 text-red-500" />}
                            <div className="flex-1">
                              <p className="font-medium text-zinc-900">{check.item}</p>
                              <p className="text-sm text-zinc-500">{check.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Weather Info */}
                  {selectedFlight.weather && (
                    <div>
                      <h4 className="font-semibold text-zinc-900 mb-3">Weather</h4>
                      <div className="bg-zinc-50 rounded-lg p-4">
                        <div className="flex items-center gap-4 mb-3">
                          <Badge variant={
                            selectedFlight.weather.flightCategory === 'VFR' ? 'success' :
                              selectedFlight.weather.flightCategory === 'MVFR' ? 'warning' : 'destructive'
                          }>
                            {selectedFlight.weather.flightCategory}
                          </Badge>
                          <span className="text-sm text-zinc-600">
                            Wind: {selectedFlight.weather.wind?.speed || 0}kt | Visibility: {selectedFlight.weather.visibility}SM
                          </span>
                        </div>
                        <p className="text-xs font-mono text-zinc-500 break-all">
                          {selectedFlight.weather.metar}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* No audit message */}
                  {!selectedFlight.legalityChecks?.length && !selectedFlight.weather && (
                    <div className="text-center py-8">
                      <p className="text-zinc-500">Click "Run Audit" to analyze this flight</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <Plane className="w-12 h-12 text-zinc-300 mb-4" />
                <h3 className="text-lg font-medium text-zinc-900">No Flight Selected</h3>
                <p className="text-zinc-500 mt-2">Select a flight to view details and run analysis</p>
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
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold text-zinc-900 mb-4">New Flight</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Pilot</label>
            <select
              value={formData.pilotId}
              onChange={(e) => setFormData({ ...formData, pilotId: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900"
              required
            >
              <option value="">Select pilot...</option>
              {pilots.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Aircraft</label>
            <select
              value={formData.aircraftId}
              onChange={(e) => setFormData({ ...formData, aircraftId: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900"
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
              <label className="block text-sm font-medium text-zinc-700 mb-1">Date</label>
              <input
                type="date"
                value={formData.scheduledDate}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Time</label>
              <input
                type="time"
                value={formData.scheduledTime}
                onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">From</label>
              <input
                type="text"
                value={formData.departureAirport}
                onChange={(e) => setFormData({ ...formData, departureAirport: e.target.value.toUpperCase() })}
                placeholder="KJFK"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900 uppercase font-mono"
                maxLength={4}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">To</label>
              <input
                type="text"
                value={formData.arrivalAirport}
                onChange={(e) => setFormData({ ...formData, arrivalAirport: e.target.value.toUpperCase() })}
                placeholder="KBOS"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white text-zinc-900 uppercase font-mono"
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
