'use client';

import { useState, useRef } from 'react';
import { ClipboardCheck, Play, Mail, AlertTriangle, CheckCircle, XCircle, Plane, User, Cloud, RefreshCw, Calendar, MapPin, Search, ArrowRight, Zap, Shield, Upload, Clock, TrendingUp, TrendingDown, Minus, Plus, Thermometer, Wind, Eye } from 'lucide-react';
import { useFlights, useRunFlightAudit, useSendAuditEmail, useWeather, usePilots, useAircraft } from '@/lib/hooks';
import type { Flight, LegalityCheck } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

export default function FlightsPage() {
  const { data: flights, isLoading, error, refetch } = useFlights({ upcoming: true });
  const { data: pilots } = usePilots();
  const { data: aircraft } = useAircraft();
  const runAudit = useRunFlightAudit();
  const sendEmail = useSendAuditEmail();
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [weatherAirport, setWeatherAirport] = useState('');
  const [showNewFlightModal, setShowNewFlightModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const formatDate = (date: Date | string) => new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const formatTime = (date: Date | string) => new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const formatDateTime = (date: Date | string, time?: string) => {
    const d = new Date(date);
    if (time) {
      return `${formatDate(d)} ${time}`;
    }
    return `${formatDate(d)} ${formatTime(d)}`;
  };

  const getStatusBadgeVariant = (status: string) => status === 'go' ? 'success' : status === 'caution' ? 'warning' : status === 'no-go' ? 'destructive' : 'secondary';
  const getStatusLabel = (status: string) => status === 'go' ? 'GO' : status === 'caution' ? 'CAUTION' : status === 'no-go' ? 'NO-GO' : 'PENDING';

  const handleRunAudit = (flightId: string) => runAudit.mutate(flightId, { onSuccess: (data) => setSelectedFlight(data) });
  const handleSendEmail = (flightId: string) => sendEmail.mutate(flightId);

  // Get risk scenarios from comprehensive analysis or fallback
  const getRiskScenarios = (flight: Flight) => {
    const snapshot = flight.safetyAnalysisSnapshot as any;
    if (snapshot && snapshot.combinedRiskScenarios) {
      return snapshot.combinedRiskScenarios;
    }
    if (snapshot && snapshot.riskScenarios) {
      return snapshot.riskScenarios;
    }
    return [];
  };

  if (isLoading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div></div>;
  if (error) return <div className="text-center py-12"><AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" /><p className="text-zinc-600">Failed to load flights.</p></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Flight Risk Analysis</h1>
          <p className="text-sm text-zinc-500">Weather, pilot, aircraft, and scenario-based risk assessment with METAR/TAF integration.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowUploadModal(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload Flight Plan
          </Button>
          <Button variant="outline" onClick={() => setShowNewFlightModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Flight
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[600px]">
        {/* Left Column: List & Weather */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {/* Weather Widget */}
          <WeatherLookup airport={weatherAirport} onAirportChange={setWeatherAirport} />

          {/* Upcoming Flights List */}
          <div className="border border-zinc-200 rounded-xl bg-white flex flex-col overflow-hidden shadow-sm flex-1">
            <div className="p-3 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center">
              <h3 className="font-semibold text-zinc-900 text-sm">Upcoming Flights</h3>
              <span className="text-xs text-zinc-500 bg-zinc-200 px-1.5 py-0.5 rounded-full">{flights?.length || 0}</span>
            </div>
            <div className="overflow-y-auto flex-1 p-2 space-y-1">
              {flights?.map((flight) => {
                const pilot = flight.pilot as any;
                const aircraftData = flight.aircraft as any;
                const isSelected = selectedFlight?._id === flight._id;

                return (
                  <div
                    key={flight._id}
                    onClick={() => setSelectedFlight(flight)}
                    className={cn(
                      "group p-3 rounded-lg cursor-pointer transition-all border border-transparent hover:border-zinc-200",
                      isSelected ? "bg-blue-50 border-blue-200 shadow-sm" : "hover:bg-zinc-50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant={getStatusBadgeVariant(flight.overallStatus)} className="text-[10px] h-5 px-1.5">
                        {getStatusLabel(flight.overallStatus)}
                      </Badge>
                      <span className="text-xs text-zinc-500 font-mono">
                        {formatDateTime(flight.scheduledDate, (flight as any).scheduledTime)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("font-bold text-sm", isSelected ? "text-blue-900" : "text-zinc-900")}>{aircraftData?.tailNumber}</span>
                      <span className="text-zinc-300 text-xs">|</span>
                      <span className="text-xs text-zinc-600 truncate">{pilot?.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
                      <span>{flight.departureAirport}</span>
                      <ArrowRight className="w-3 h-3 text-zinc-300" />
                      <span>{flight.arrivalAirport || 'Local'}</span>
                      {(flight as any).scheduledTime && (
                        <>
                          <span className="text-zinc-300 mx-1">|</span>
                          <Clock className="w-3 h-3" />
                          <span>{(flight as any).scheduledTime}</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              {(!flights || flights.length === 0) && (
                <div className="text-center py-12">
                  <Plane className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500">No upcoming flights.</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowUploadModal(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Flight Plan
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Detail Panel */}
        <div className="lg:col-span-2 border border-zinc-200 rounded-xl bg-white flex flex-col shadow-sm overflow-hidden">
          {selectedFlight ? (
            <>
              {/* Header */}
              <div className="p-6 border-b border-zinc-100 flex items-start justify-between bg-zinc-50/30">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant={getStatusBadgeVariant(selectedFlight.overallStatus)} className="text-sm px-2.5 py-0.5">
                      {getStatusLabel(selectedFlight.overallStatus)}
                    </Badge>
                    {selectedFlight.emailSent && (
                      <span className="flex items-center text-xs text-emerald-600 font-medium">
                        <CheckCircle className="w-3 h-3 mr-1" /> Email Sent
                      </span>
                    )}
                    {(selectedFlight as any).flightPlannerData && (
                      <span className="flex items-center text-xs text-blue-600 font-medium">
                        <Upload className="w-3 h-3 mr-1" /> From {(selectedFlight as any).flightPlannerData.source}
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-zinc-900">{(selectedFlight.aircraft as any)?.tailNumber} Risk Report</h2>
                  <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500">
                    <div className="flex items-center gap-1.5"><User className="w-4 h-4" /> {(selectedFlight.pilot as any)?.name}</div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      {formatDateTime(selectedFlight.scheduledDate, (selectedFlight as any).scheduledTime)}
                    </div>
                    <div className="flex items-center gap-1.5 font-mono"><MapPin className="w-4 h-4" /> {selectedFlight.departureAirport} → {selectedFlight.arrivalAirport || 'Local'}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => handleRunAudit(selectedFlight._id)} disabled={runAudit.isPending} variant="default" className="bg-zinc-900 hover:bg-zinc-800">
                    {runAudit.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    Run Audit
                  </Button>
                  <Button onClick={() => handleSendEmail(selectedFlight._id)} disabled={sendEmail.isPending || selectedFlight.overallStatus === 'no-go'} variant="outline">
                    <Mail className="w-4 h-4 mr-2" />
                    Send
                  </Button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto flex-1 bg-zinc-50/50 space-y-6">
                {/* Comprehensive Analysis Summary */}
                {selectedFlight.safetyAnalysisSnapshot && (selectedFlight.safetyAnalysisSnapshot as any).reasoning && (
                  <div className="bg-white rounded-lg border border-zinc-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-zinc-900 flex items-center">
                        <Shield className="w-4 h-4 mr-2 text-blue-500" /> Safety Analysis Summary
                      </h4>
                      {(selectedFlight.safetyAnalysisSnapshot as any).overallScore !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500">Score:</span>
                          <Badge variant={
                            (selectedFlight.safetyAnalysisSnapshot as any).overallScore >= 70 ? 'success' :
                            (selectedFlight.safetyAnalysisSnapshot as any).overallScore >= 50 ? 'warning' : 'destructive'
                          }>
                            {(selectedFlight.safetyAnalysisSnapshot as any).overallScore}/100
                          </Badge>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-zinc-600">{(selectedFlight.safetyAnalysisSnapshot as any).reasoning}</p>
                  </div>
                )}

                {/* Risk Matrix */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-900 flex items-center">
                    <Zap className="w-4 h-4 mr-2 text-amber-500" /> Risk Scenarios
                  </h3>
                  <div className="space-y-3">
                    {getRiskScenarios(selectedFlight).map((scenario: any, i: number) => (
                      <RiskScenarioCard key={i} {...scenario} />
                    ))}
                    {getRiskScenarios(selectedFlight).length === 0 && (
                      <p className="text-sm text-zinc-500 text-center py-4">Run audit to generate risk scenarios</p>
                    )}
                  </div>
                </div>

                {/* Pilot and Aircraft Assessment */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg border border-zinc-200 p-4">
                    <h4 className="text-sm font-semibold text-zinc-900 flex items-center mb-3">
                      <User className="w-4 h-4 mr-2 text-blue-500" /> Pilot
                    </h4>
                    <PilotAssessment pilot={selectedFlight.pilot as any} analysis={(selectedFlight.safetyAnalysisSnapshot as any)?.pilotAnalysis} />
                  </div>
                  <div className="bg-white rounded-lg border border-zinc-200 p-4">
                    <h4 className="text-sm font-semibold text-zinc-900 flex items-center mb-3">
                      <Plane className="w-4 h-4 mr-2 text-emerald-500" /> Aircraft
                    </h4>
                    <AircraftAssessment aircraft={selectedFlight.aircraft as any} analysis={(selectedFlight.safetyAnalysisSnapshot as any)?.aircraftAnalysis} />
                  </div>
                </div>

                {/* Enhanced Weather Display */}
                {selectedFlight.weather && (
                  <EnhancedWeatherDisplay
                    departureWeather={selectedFlight.weather}
                    arrivalWeather={(selectedFlight as any).arrivalWeather}
                    departureAirport={selectedFlight.departureAirport}
                    arrivalAirport={selectedFlight.arrivalAirport}
                  />
                )}

                {/* Legality Checks */}
                {selectedFlight.legalityChecks && selectedFlight.legalityChecks.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-zinc-900 flex items-center">
                      <ClipboardCheck className="w-4 h-4 mr-2 text-zinc-500" /> Compliance Checks
                    </h3>
                    <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                      <div className="divide-y divide-zinc-100">
                        {selectedFlight.legalityChecks.map((check, idx) => (
                          <div key={idx} className="p-3 flex items-center gap-3">
                            {check.status === 'pass' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                            {check.status === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                            {check.status === 'fail' && <XCircle className="w-4 h-4 text-red-500" />}
                            <div className="flex-1">
                              <span className="text-sm font-medium text-zinc-900">{check.item}</span>
                              <span className="text-xs text-zinc-500 ml-2">{check.message}</span>
                              {check.details && (
                                <p className="text-xs text-zinc-400 mt-1">{check.details}</p>
                              )}
                            </div>
                            <Badge variant={check.status === 'pass' ? 'secondary' : check.status === 'warning' ? 'warning' : 'destructive'} className="text-[10px]">
                              {check.status.toUpperCase()}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-zinc-50/50">
              <div className="w-16 h-16 bg-white border border-zinc-200 rounded-full flex items-center justify-center shadow-sm mb-4">
                <Plane className="w-8 h-8 text-zinc-300 transform -rotate-45" />
              </div>
              <h3 className="text-lg font-medium text-zinc-900">No Flight Selected</h3>
              <p className="text-zinc-500 max-w-xs mx-auto mt-2">Select a flight to view comprehensive risk analysis with METAR/TAF weather data.</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowUploadModal(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Flight Plan Photo
              </Button>
            </div>
          )}
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

      {/* Upload Modal */}
      {showUploadModal && (
        <FlightPlanUploadModal
          pilots={pilots || []}
          aircraft={aircraft || []}
          onClose={() => setShowUploadModal(false)}
          onCreated={(flight) => {
            setShowUploadModal(false);
            refetch();
            setSelectedFlight(flight);
          }}
        />
      )}
    </div>
  );
}

// Enhanced Weather Display Component
function EnhancedWeatherDisplay({
  departureWeather,
  arrivalWeather,
  departureAirport,
  arrivalAirport,
}: {
  departureWeather: any;
  arrivalWeather?: any;
  departureAirport: string;
  arrivalAirport?: string;
}) {
  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'VFR': return 'text-green-600 bg-green-50';
      case 'MVFR': return 'text-blue-600 bg-blue-50';
      case 'IFR': return 'text-red-600 bg-red-50';
      case 'LIFR': return 'text-purple-600 bg-purple-50';
      default: return 'text-zinc-600 bg-zinc-50';
    }
  };

  const getTrendIcon = (trend?: string) => {
    if (trend === 'improving') return <TrendingUp className="w-3 h-3 text-green-500" />;
    if (trend === 'deteriorating') return <TrendingDown className="w-3 h-3 text-red-500" />;
    return <Minus className="w-3 h-3 text-zinc-400" />;
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-zinc-900 flex items-center">
        <Cloud className="w-4 h-4 mr-2 text-sky-500" /> Weather Conditions
      </h3>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Departure Weather */}
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Departure: {departureAirport}</h4>
            <div className="flex items-center gap-1">
              {getTrendIcon(departureWeather.trend)}
              <span className="text-xs text-zinc-500">{departureWeather.trend || 'stable'}</span>
            </div>
          </div>

          <div className={cn("text-center py-2 rounded-md text-lg font-bold mb-3", getCategoryColor(departureWeather.flightCategory))}>
            {departureWeather.flightCategory}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
            <div className="p-2 bg-zinc-50 rounded flex items-center gap-2">
              <Wind className="w-3 h-3 text-zinc-400" />
              <div>
                <div className="text-zinc-500">Wind</div>
                <div className="font-medium text-zinc-900">
                  {departureWeather.wind?.speed || 0}kt
                  {departureWeather.wind?.gust && <span className="text-red-500"> G{departureWeather.wind.gust}</span>}
                </div>
              </div>
            </div>
            <div className="p-2 bg-zinc-50 rounded flex items-center gap-2">
              <Eye className="w-3 h-3 text-zinc-400" />
              <div>
                <div className="text-zinc-500">Visibility</div>
                <div className="font-medium text-zinc-900">{departureWeather.visibility}SM</div>
              </div>
            </div>
            <div className="p-2 bg-zinc-50 rounded flex items-center gap-2">
              <Cloud className="w-3 h-3 text-zinc-400" />
              <div>
                <div className="text-zinc-500">Ceiling</div>
                <div className="font-medium text-zinc-900">{departureWeather.ceiling || 'CLR'}</div>
              </div>
            </div>
            {departureWeather.densityAltitude && (
              <div className="p-2 bg-zinc-50 rounded flex items-center gap-2">
                <Thermometer className="w-3 h-3 text-zinc-400" />
                <div>
                  <div className="text-zinc-500">DA</div>
                  <div className="font-medium text-zinc-900">{departureWeather.densityAltitude}ft</div>
                </div>
              </div>
            )}
          </div>

          <div className="text-[10px] font-mono text-zinc-400 bg-zinc-50 p-2 rounded break-all leading-tight">
            {departureWeather.metar}
          </div>

          {departureWeather.taf && (
            <div className="mt-2 text-[10px] font-mono text-zinc-400 bg-blue-50 p-2 rounded break-all leading-tight">
              <span className="text-blue-600 font-semibold">TAF: </span>
              {departureWeather.taf.substring(0, 200)}...
            </div>
          )}
        </div>

        {/* Arrival Weather */}
        {arrivalWeather && arrivalAirport && (
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Arrival: {arrivalAirport}</h4>
              <div className="flex items-center gap-1">
                {getTrendIcon(arrivalWeather.trend)}
                <span className="text-xs text-zinc-500">{arrivalWeather.trend || 'stable'}</span>
              </div>
            </div>

            <div className={cn("text-center py-2 rounded-md text-lg font-bold mb-3", getCategoryColor(arrivalWeather.flightCategory))}>
              {arrivalWeather.flightCategory}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div className="p-2 bg-zinc-50 rounded flex items-center gap-2">
                <Wind className="w-3 h-3 text-zinc-400" />
                <div>
                  <div className="text-zinc-500">Wind</div>
                  <div className="font-medium text-zinc-900">
                    {arrivalWeather.wind?.speed || 0}kt
                    {arrivalWeather.wind?.gust && <span className="text-red-500"> G{arrivalWeather.wind.gust}</span>}
                  </div>
                </div>
              </div>
              <div className="p-2 bg-zinc-50 rounded flex items-center gap-2">
                <Eye className="w-3 h-3 text-zinc-400" />
                <div>
                  <div className="text-zinc-500">Visibility</div>
                  <div className="font-medium text-zinc-900">{arrivalWeather.visibility}SM</div>
                </div>
              </div>
            </div>

            <div className="text-[10px] font-mono text-zinc-400 bg-zinc-50 p-2 rounded break-all leading-tight">
              {arrivalWeather.metar}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RiskScenarioCard({ title, probability, severity, description, mitigations }: { title: string; probability: number; severity: 'low' | 'medium' | 'high' | 'critical'; description: string; mitigations?: string[] }) {
  const severityColors = {
    low: 'border-emerald-200 bg-emerald-50',
    medium: 'border-amber-200 bg-amber-50',
    high: 'border-orange-200 bg-orange-50',
    critical: 'border-red-200 bg-red-50',
  };
  const severityTextColors = {
    low: 'text-emerald-700',
    medium: 'text-amber-700',
    high: 'text-orange-700',
    critical: 'text-red-700',
  };
  const severityBadge = {
    low: 'secondary',
    medium: 'warning',
    high: 'warning',
    critical: 'destructive',
  } as const;

  return (
    <div className={cn("p-4 rounded-lg border", severityColors[severity])}>
      <div className="flex items-center justify-between mb-2">
        <h4 className={cn("font-semibold text-sm", severityTextColors[severity])}>{title}</h4>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-600">{probability}% prob</span>
          <Badge variant={severityBadge[severity]} className="text-xs">{severity.toUpperCase()}</Badge>
        </div>
      </div>
      <p className="text-sm text-zinc-600">{description}</p>
      {mitigations && mitigations.length > 0 && (
        <div className="mt-2 pt-2 border-t border-zinc-200">
          <p className="text-xs font-semibold text-zinc-500 mb-1">Mitigations:</p>
          <ul className="text-xs text-zinc-500 list-disc list-inside">
            {mitigations.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function PilotAssessment({ pilot, analysis }: { pilot: any; analysis?: any }) {
  if (!pilot) return <p className="text-sm text-zinc-500">No pilot data</p>;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-zinc-500">Certificate</span>
        <span className="font-medium">{pilot.certificates?.type || 'Unknown'}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-500">Total Hours</span>
        <span className="font-medium">{pilot.experience?.totalHours || 0}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-500">Night Hours</span>
        <span className="font-medium">{pilot.experience?.nightHours || 0}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-500">Instrument</span>
        <span className="font-medium">{pilot.certificates?.instrumentRated ? 'Yes' : 'No'}</span>
      </div>
      {analysis && (
        <>
          <div className="flex justify-between text-sm pt-2 border-t border-zinc-100">
            <span className="text-zinc-500">Currency</span>
            <Badge variant={analysis.currencyStatus === 'current' ? 'success' : analysis.currencyStatus === 'expiring' ? 'warning' : 'destructive'}>
              {analysis.currencyStatus}
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Experience Level</span>
            <span className="font-medium capitalize">{analysis.experienceLevel?.replace('_', ' ')}</span>
          </div>
        </>
      )}
      {pilot.safetyAnalysis && (
        <div className="flex justify-between text-sm pt-2 border-t border-zinc-100">
          <span className="text-zinc-500">AI Safety Score</span>
          <Badge variant={pilot.safetyAnalysis.score > 7 ? 'destructive' : pilot.safetyAnalysis.score > 4 ? 'warning' : 'success'}>
            {pilot.safetyAnalysis.score}/10 Risk
          </Badge>
        </div>
      )}
    </div>
  );
}

function AircraftAssessment({ aircraft, analysis }: { aircraft: any; analysis?: any }) {
  if (!aircraft) return <p className="text-sm text-zinc-500">No aircraft data</p>;

  const getDaysUntil = (date: Date | string) => Math.ceil((new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  const annualDays = getDaysUntil(aircraft.maintenanceDates?.annual);

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-zinc-500">Tail</span>
        <span className="font-medium font-mono">{aircraft.tailNumber}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-500">Model</span>
        <span className="font-medium">{aircraft.model}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-500">Hobbs</span>
        <span className="font-medium">{aircraft.currentHours?.hobbs?.toFixed(1) || 0}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-500">Annual Due</span>
        <span className={cn("font-medium", annualDays < 30 ? "text-red-600" : "")}>{annualDays}d</span>
      </div>
      {analysis && (
        <>
          <div className="flex justify-between text-sm pt-2 border-t border-zinc-100">
            <span className="text-zinc-500">Maintenance</span>
            <Badge variant={analysis.maintenanceStatus === 'current' ? 'success' : analysis.maintenanceStatus === 'due_soon' ? 'warning' : 'destructive'}>
              {analysis.maintenanceStatus?.replace('_', ' ')}
            </Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Performance</span>
            <span className="font-medium capitalize">{analysis.performanceMargins}</span>
          </div>
        </>
      )}
    </div>
  );
}

function WeatherLookup({ airport, onAirportChange }: { airport: string; onAirportChange: (v: string) => void }) {
  const { data: weather, isLoading, error } = useWeather(airport);

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'VFR': return 'text-green-600 bg-green-50 border-green-200';
      case 'MVFR': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'IFR': return 'text-red-600 bg-red-50 border-red-200';
      case 'LIFR': return 'text-purple-600 bg-purple-50 border-purple-200';
      default: return 'text-zinc-600 bg-zinc-50 border-zinc-200';
    }
  };

  return (
    <div className="border border-zinc-200 rounded-xl bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center">
        <Cloud className="w-4 h-4 mr-2 text-zinc-500" />
        Weather Lookup
      </h3>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          type="text"
          placeholder="ICAO (e.g. KJFK)"
          value={airport}
          onChange={(e) => onAirportChange(e.target.value.toUpperCase())}
          className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase font-mono"
          maxLength={4}
        />
      </div>

      {isLoading && airport.length >= 3 && (
        <div className="flex items-center justify-center py-2">
          <RefreshCw className="w-4 h-4 animate-spin text-zinc-400" />
        </div>
      )}

      {error && airport.length >= 3 && (
        <Badge variant="destructive" className="w-full justify-center">Fetch Failed</Badge>
      )}

      {weather && !isLoading && (
        <div className="space-y-3">
          <div className={cn("text-center py-1 rounded border text-sm font-bold", getCategoryColor(weather.flightCategory))}>
            {weather.flightCategory}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-zinc-50 rounded">
              <div className="text-zinc-500 mb-0.5">Wind</div>
              <div className="font-medium text-zinc-900">{weather.wind?.speed || 0}kt</div>
            </div>
            <div className="p-2 bg-zinc-50 rounded">
              <div className="text-zinc-500 mb-0.5">Vis</div>
              <div className="font-medium text-zinc-900">{weather.visibility}sm</div>
            </div>
          </div>
          <div className="text-[10px] font-mono text-zinc-400 break-all leading-tight bg-zinc-50 p-2 rounded">
            {weather.metar}
          </div>
          {weather.taf && (
            <div className="text-[10px] font-mono text-zinc-400 break-all leading-tight bg-blue-50 p-2 rounded">
              <span className="text-blue-600 font-semibold">TAF: </span>
              {weather.taf.substring(0, 100)}...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// New Flight Modal with Time Selection
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
    notes: '',
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
          notes: formData.notes || undefined,
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold mb-4">New Flight</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-zinc-700">Pilot</label>
            <select
              value={formData.pilotId}
              onChange={(e) => setFormData({ ...formData, pilotId: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-md"
              required
            >
              <option value="">Select pilot...</option>
              {pilots.map((p) => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Aircraft</label>
            <select
              value={formData.aircraftId}
              onChange={(e) => setFormData({ ...formData, aircraftId: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-md"
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
              <label className="text-sm font-medium text-zinc-700">Date</label>
              <input
                type="date"
                value={formData.scheduledDate}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-md"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Time (optional)</label>
              <input
                type="time"
                value={formData.scheduledTime}
                onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-zinc-700">Departure</label>
              <input
                type="text"
                value={formData.departureAirport}
                onChange={(e) => setFormData({ ...formData, departureAirport: e.target.value.toUpperCase() })}
                placeholder="KJFK"
                className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-md uppercase font-mono"
                maxLength={4}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Arrival (optional)</label>
              <input
                type="text"
                value={formData.arrivalAirport}
                onChange={(e) => setFormData({ ...formData, arrivalAirport: e.target.value.toUpperCase() })}
                placeholder="KBOS"
                className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-md uppercase font-mono"
                maxLength={4}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-md"
              rows={2}
            />
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Create Flight
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Flight Plan Upload Modal
function FlightPlanUploadModal({
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [overrides, setOverrides] = useState({ pilotId: '', aircraftId: '' });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setParsedData(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('autoCreate', 'false'); // First just parse
      if (overrides.pilotId) formData.append('pilotId', overrides.pilotId);
      if (overrides.aircraftId) formData.append('aircraftId', overrides.aircraftId);

      const res = await fetch('/api/flights/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setParsedData(data.data);
        // Auto-set overrides if matched
        if (data.data.matches?.pilot?.id) {
          setOverrides(prev => ({ ...prev, pilotId: data.data.matches.pilot.id }));
        }
        if (data.data.matches?.aircraft?.id) {
          setOverrides(prev => ({ ...prev, aircraftId: data.data.matches.aircraft.id }));
        }
      } else {
        alert('Parse failed: ' + data.error);
      }
    } catch (err) {
      alert('Upload error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedFile || !overrides.pilotId || !overrides.aircraftId) {
      alert('Please select pilot and aircraft');
      return;
    }
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('autoCreate', 'true');
      formData.append('pilotId', overrides.pilotId);
      formData.append('aircraftId', overrides.aircraftId);

      const res = await fetch('/api/flights/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.created) {
        onCreated(data.data.flight);
      } else {
        alert('Create failed: ' + data.error);
      }
    } catch (err) {
      alert('Create error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
        <h2 className="text-lg font-bold mb-4 flex items-center">
          <Upload className="w-5 h-5 mr-2" />
          Upload Flight Plan
        </h2>

        <div className="space-y-4">
          {/* File Upload */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              selectedFile ? "border-blue-300 bg-blue-50" : "border-zinc-300 hover:border-zinc-400"
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            {selectedFile ? (
              <div>
                <CheckCircle className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                <p className="font-medium text-zinc-900">{selectedFile.name}</p>
                <p className="text-xs text-zinc-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div>
                <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
                <p className="text-sm text-zinc-600">Click or drag to upload</p>
                <p className="text-xs text-zinc-400">PNG, JPG, PDF (PaperlessFBO, ForeFlight, etc.)</p>
              </div>
            )}
          </div>

          {/* Parse Button */}
          {selectedFile && !parsedData && (
            <Button onClick={handleUpload} disabled={isUploading} className="w-full">
              {isUploading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              Parse Flight Plan
            </Button>
          )}

          {/* Parsed Data Display */}
          {parsedData && (
            <div className="space-y-4">
              <div className="bg-zinc-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-sm">Parsed Data</h4>
                  <Badge variant={parsedData.confidence > 0.7 ? 'success' : 'warning'}>
                    {Math.round(parsedData.confidence * 100)}% confidence
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {parsedData.parsedData.pilotName && (
                    <div><span className="text-zinc-500">Pilot:</span> {parsedData.parsedData.pilotName}</div>
                  )}
                  {parsedData.parsedData.aircraftTail && (
                    <div><span className="text-zinc-500">Aircraft:</span> {parsedData.parsedData.aircraftTail}</div>
                  )}
                  {parsedData.parsedData.date && (
                    <div><span className="text-zinc-500">Date:</span> {parsedData.parsedData.date}</div>
                  )}
                  {parsedData.parsedData.departureTime && (
                    <div><span className="text-zinc-500">Time:</span> {parsedData.parsedData.departureTime}</div>
                  )}
                  {parsedData.parsedData.departureAirport && (
                    <div><span className="text-zinc-500">From:</span> {parsedData.parsedData.departureAirport}</div>
                  )}
                  {parsedData.parsedData.arrivalAirport && (
                    <div><span className="text-zinc-500">To:</span> {parsedData.parsedData.arrivalAirport}</div>
                  )}
                </div>
              </div>

              {/* Override Selections */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-zinc-700">Confirm Pilot</label>
                  <select
                    value={overrides.pilotId}
                    onChange={(e) => setOverrides({ ...overrides, pilotId: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-md text-sm"
                    required
                  >
                    <option value="">Select...</option>
                    {pilots.map((p) => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-700">Confirm Aircraft</label>
                  <select
                    value={overrides.aircraftId}
                    onChange={(e) => setOverrides({ ...overrides, aircraftId: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-zinc-300 rounded-md text-sm"
                    required
                  >
                    <option value="">Select...</option>
                    {aircraft.map((a) => (
                      <option key={a._id} value={a._id}>{a.tailNumber}</option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                onClick={handleCreate}
                disabled={isUploading || !overrides.pilotId || !overrides.aircraftId}
                className="w-full"
              >
                {isUploading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Create Flight & Run Analysis
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 mt-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
