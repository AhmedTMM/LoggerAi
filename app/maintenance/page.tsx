'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plane,
  Wrench,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calendar,
  Shield,
  FileText,
  Upload,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  XCircle,
  Gauge,
  Radio,
  Navigation,
  Battery,
  Compass,
  Wind,
  Settings,
  Plus,
  Search,
  Loader2,
} from 'lucide-react';
import { useAircraft } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LogbookUI, ILogbookEntry } from '@/components/LogbookUI';
import { cn } from '@/lib/utils';

// AV1ONICS Check Item Component
function AV1ONICSCheckItem({
  code,
  name,
  status,
  dueDate,
  daysRemaining,
  message,
  icon: Icon,
}: {
  code: string;
  name: string;
  status: 'current' | 'due_soon' | 'overdue' | 'na';
  dueDate?: string;
  daysRemaining?: number;
  message: string;
  icon: any;
}) {
  const statusConfig = {
    current: {
      color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      icon: CheckCircle,
      iconColor: 'text-emerald-500',
      badge: 'success',
    },
    due_soon: {
      color: 'bg-amber-100 text-amber-700 border-amber-200',
      icon: Clock,
      iconColor: 'text-amber-500',
      badge: 'warning',
    },
    overdue: {
      color: 'bg-red-100 text-red-700 border-red-200',
      icon: XCircle,
      iconColor: 'text-red-500',
      badge: 'destructive',
    },
    na: {
      color: 'bg-zinc-100 text-zinc-500 border-zinc-200',
      icon: Settings,
      iconColor: 'text-zinc-400',
      badge: 'secondary',
    },
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <div className={cn(
      "p-4 rounded-xl border-2 transition-all hover:shadow-md",
      config.color
    )}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg bg-white/50")}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{code}</span>
              <span className="font-semibold">{name}</span>
            </div>
            <p className="text-sm opacity-80 mt-0.5">{message}</p>
          </div>
        </div>
        <StatusIcon className={cn("w-6 h-6", config.iconColor)} />
      </div>
      {dueDate && status !== 'na' && (
        <div className="mt-3 pt-3 border-t border-current/10 flex items-center justify-between text-sm">
          <span>Due: {dueDate}</span>
          {daysRemaining !== undefined && (
            <Badge variant={config.badge as any}>
              {daysRemaining < 0 ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d remaining`}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

// MEL/KOEL Status Card
function MELStatusCard({
  requiresMEL,
  melUploaded,
  inoperativeCount,
  onUploadMEL,
}: {
  requiresMEL: boolean;
  melUploaded: boolean;
  inoperativeCount: number;
  onUploadMEL: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-zinc-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-500" />
          MEL / KOEL Status
        </h3>
        {requiresMEL && !melUploaded && (
          <Badge variant="warning">Action Required</Badge>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg">
          <span className="text-zinc-600">MEL Required</span>
          <Badge variant={requiresMEL ? 'warning' : 'secondary'}>
            {requiresMEL ? 'Yes' : 'No'}
          </Badge>
        </div>

        <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg">
          <span className="text-zinc-600">MEL Uploaded</span>
          <Badge variant={melUploaded ? 'success' : 'outline'}>
            {melUploaded ? 'Yes' : 'No'}
          </Badge>
        </div>

        {inoperativeCount > 0 && (
          <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
            <span className="text-amber-700">Inoperative Items</span>
            <Badge variant="warning">{inoperativeCount}</Badge>
          </div>
        )}

        {requiresMEL && !melUploaded && (
          <Button onClick={onUploadMEL} className="w-full mt-2">
            <Upload className="w-4 h-4 mr-2" />
            Upload MEL Document
          </Button>
        )}
      </div>
    </div>
  );
}

export default function MaintenancePage() {
  const { data: fleet = [], isLoading, refetch } = useAircraft();
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(null);
  const [av1onicsAudit, setAv1onicsAudit] = useState<any>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  // Get selected aircraft
  const selectedAircraft = fleet.find((ac: any) => ac._id === selectedAircraftId);

  // Run AV1ONICS audit when aircraft changes
  useEffect(() => {
    if (selectedAircraft) {
      runAudit(selectedAircraft._id);
    }
  }, [selectedAircraftId]);

  // Run AV1ONICS Audit
  const runAudit = async (aircraftId: string) => {
    setIsAuditing(true);
    try {
      const response = await fetch(`/api/aircraft/${aircraftId}/audit`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        setAv1onicsAudit(data.audit);
      }
    } catch (error) {
      console.error('Audit failed:', error);
    } finally {
      setIsAuditing(false);
    }
  };

  // Handle document upload
  const handleUpload = useCallback(async (file: File, category?: string) => {
    if (!selectedAircraft) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setUploadProgress(30);

      // Upload and parse
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64,
          fileType: file.type.includes('pdf') ? 'pdf' : 'image',
          documentType: 'maintenance',
          filename: file.name,
          aircraftId: selectedAircraft._id,
          category,
        }),
      });

      setUploadProgress(70);

      const data = await response.json();
      if (data.success) {
        setUploadProgress(100);
        // Refresh aircraft data
        refetch();
        // Re-run audit
        runAudit(selectedAircraft._id);
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 1000);
    }
  }, [selectedAircraft, refetch]);

  // Filter fleet
  const filteredFleet = fleet.filter((ac: any) =>
    ac.tailNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ac.model?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Convert aircraft logs to logbook entries
  const getLogbookEntries = (aircraft: any): ILogbookEntry[] => {
    const entries: ILogbookEntry[] = [];

    // Add entries from categorized logbooks
    if (aircraft.logbooks) {
      ['engine', 'airframe', 'propeller', 'avionics'].forEach(cat => {
        const catLogs = aircraft.logbooks[cat] || [];
        catLogs.forEach((log: any, idx: number) => {
          entries.push({
            id: `${cat}-${idx}`,
            date: log.date ? new Date(log.date).toISOString().split('T')[0] : '',
            description: log.description,
            hobbsTime: log.hobbsTime,
            tachTime: log.tachTime,
            mechanic: log.mechanic,
            category: cat as any,
          });
        });
      });
    }

    // Add entries from general logs
    if (aircraft.logs) {
      aircraft.logs.forEach((log: any, idx: number) => {
        entries.push({
          id: `log-${idx}`,
          date: log.date ? new Date(log.date).toISOString().split('T')[0] : '',
          description: log.description,
          hobbsTime: log.hobbsTime,
          tachTime: log.tachTime,
          mechanic: log.mechanic,
          category: log.category || 'airframe',
        });
      });
    }

    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // Get aircraft status summary
  const getFleetSummary = () => {
    let airworthy = 0;
    let conditional = 0;
    let grounded = 0;

    fleet.forEach((ac: any) => {
      const annualDate = ac.maintenanceDates?.annual;
      if (!annualDate) {
        grounded++;
        return;
      }
      const daysUntilAnnual = Math.floor((new Date(annualDate).getTime() - Date.now()) / 86400000);
      const yearFromAnnual = daysUntilAnnual + 365;

      if (yearFromAnnual < 0) {
        grounded++;
      } else if (yearFromAnnual < 30) {
        conditional++;
      } else {
        airworthy++;
      }
    });

    return { airworthy, conditional, grounded };
  };

  const fleetSummary = getFleetSummary();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-zinc-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-3">
              <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-2 rounded-xl shadow-lg">
                <Wrench className="w-6 h-6 text-white" />
              </div>
              Maintenance Dashboard
            </h1>
            <p className="text-zinc-500 mt-1">
              AV1ONICS Compliance & Aircraft Logbook Management
            </p>
          </div>
        </div>

        {/* Fleet Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Plane className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-500">Total Fleet</p>
                <p className="text-2xl font-bold text-zinc-900">{fleet.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 rounded-xl">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-500">Airworthy</p>
                <p className="text-2xl font-bold text-emerald-600">{fleetSummary.airworthy}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-500">Conditional</p>
                <p className="text-2xl font-bold text-amber-600">{fleetSummary.conditional}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-xl">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-zinc-500">Grounded</p>
                <p className="text-2xl font-bold text-red-600">{fleetSummary.grounded}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Aircraft Selector */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden sticky top-6">
              <div className="p-4 border-b border-zinc-200 bg-zinc-50">
                <h3 className="font-semibold text-zinc-900">Select Aircraft</h3>
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 rounded-lg bg-white"
                  />
                </div>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {filteredFleet.map((ac: any) => {
                  const isSelected = selectedAircraftId === ac._id;
                  return (
                    <div
                      key={ac._id}
                      onClick={() => setSelectedAircraftId(ac._id)}
                      className={cn(
                        "p-4 border-b border-zinc-100 cursor-pointer transition-all",
                        isSelected
                          ? "bg-blue-50 border-l-4 border-l-blue-500"
                          : "hover:bg-zinc-50"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-zinc-900">{ac.tailNumber}</p>
                          <p className="text-sm text-zinc-500">{ac.model}</p>
                        </div>
                        <ChevronRight className={cn(
                          "w-5 h-5 text-zinc-400 transition-transform",
                          isSelected && "text-blue-500 rotate-90"
                        )} />
                      </div>
                    </div>
                  );
                })}
                {filteredFleet.length === 0 && (
                  <div className="p-8 text-center">
                    <Plane className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                    <p className="text-zinc-500">No aircraft found</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-9 space-y-6">
            {selectedAircraft ? (
              <>
                {/* Aircraft Header */}
                <div className="bg-white rounded-xl border border-zinc-200 p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                        <Plane className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-zinc-900">
                          {selectedAircraft.tailNumber}
                        </h2>
                        <p className="text-zinc-500">
                          {selectedAircraft.year} {selectedAircraft.manufacturer} {selectedAircraft.model}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <span className="text-zinc-600">
                            Hobbs: <span className="font-semibold">{selectedAircraft.currentHours?.hobbs?.toFixed(1) || 0}</span>
                          </span>
                          <span className="text-zinc-600">
                            Tach: <span className="font-semibold">{selectedAircraft.currentHours?.tach?.toFixed(1) || 0}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => runAudit(selectedAircraft._id)}
                      disabled={isAuditing}
                    >
                      {isAuditing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Shield className="w-4 h-4 mr-2" />
                      )}
                      Run AV1ONICS Audit
                    </Button>
                  </div>
                </div>

                {/* AV1ONICS Dashboard */}
                {av1onicsAudit && (
                  <div className="bg-white rounded-xl border border-zinc-200 p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-lg font-bold text-zinc-900">
                          AV1ONICS Compliance Status
                        </h3>
                        <p className="text-sm text-zinc-500">
                          Airworthiness inspection tracking per FAR requirements
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "px-4 py-2 rounded-full font-bold text-sm",
                          av1onicsAudit.overallStatus === 'airworthy' && "bg-emerald-100 text-emerald-700",
                          av1onicsAudit.overallStatus === 'conditional' && "bg-amber-100 text-amber-700",
                          av1onicsAudit.overallStatus === 'grounded' && "bg-red-100 text-red-700",
                        )}>
                          {av1onicsAudit.overallStatus?.toUpperCase()}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-zinc-900">
                            {av1onicsAudit.overallScore}
                          </p>
                          <p className="text-xs text-zinc-500">Score</p>
                        </div>
                      </div>
                    </div>

                    {/* AV1ONICS Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <AV1ONICSCheckItem
                        code="A"
                        name="Annual"
                        icon={Calendar}
                        status={av1onicsAudit.checks?.annual?.status || 'na'}
                        dueDate={av1onicsAudit.checks?.annual?.dueDate ? new Date(av1onicsAudit.checks.annual.dueDate).toLocaleDateString() : undefined}
                        daysRemaining={av1onicsAudit.checks?.annual?.daysRemaining}
                        message={av1onicsAudit.checks?.annual?.message || 'Annual inspection'}
                      />
                      <AV1ONICSCheckItem
                        code="V"
                        name="VOR Check"
                        icon={Navigation}
                        status={av1onicsAudit.checks?.vor?.status || 'na'}
                        dueDate={av1onicsAudit.checks?.vor?.dueDate ? new Date(av1onicsAudit.checks.vor.dueDate).toLocaleDateString() : undefined}
                        daysRemaining={av1onicsAudit.checks?.vor?.daysRemaining}
                        message={av1onicsAudit.checks?.vor?.message || 'VOR accuracy (IFR)'}
                      />
                      <AV1ONICSCheckItem
                        code="1"
                        name="100-Hour"
                        icon={Gauge}
                        status={av1onicsAudit.checks?.hundredHour?.status || 'na'}
                        dueDate={av1onicsAudit.checks?.hundredHour?.hoursRemaining ? `${av1onicsAudit.checks.hundredHour.hoursRemaining?.toFixed(0)} hrs` : undefined}
                        daysRemaining={av1onicsAudit.checks?.hundredHour?.hoursRemaining}
                        message={av1onicsAudit.checks?.hundredHour?.message || '100-hour (for hire)'}
                      />
                      <AV1ONICSCheckItem
                        code="O"
                        name="Altimeter"
                        icon={Gauge}
                        status={av1onicsAudit.checks?.altimeter?.status || 'na'}
                        dueDate={av1onicsAudit.checks?.altimeter?.dueDate ? new Date(av1onicsAudit.checks.altimeter.dueDate).toLocaleDateString() : undefined}
                        daysRemaining={av1onicsAudit.checks?.altimeter?.daysRemaining}
                        message={av1onicsAudit.checks?.altimeter?.message || 'Altimeter/Pitot-Static'}
                      />
                      <AV1ONICSCheckItem
                        code="N"
                        name="Transponder"
                        icon={Radio}
                        status={av1onicsAudit.checks?.transponder?.status || 'na'}
                        dueDate={av1onicsAudit.checks?.transponder?.dueDate ? new Date(av1onicsAudit.checks.transponder.dueDate).toLocaleDateString() : undefined}
                        daysRemaining={av1onicsAudit.checks?.transponder?.daysRemaining}
                        message={av1onicsAudit.checks?.transponder?.message || 'Transponder check'}
                      />
                      <AV1ONICSCheckItem
                        code="I"
                        name="ELT"
                        icon={Battery}
                        status={av1onicsAudit.checks?.elt?.status || 'na'}
                        dueDate={av1onicsAudit.checks?.elt?.dueDate ? new Date(av1onicsAudit.checks.elt.dueDate).toLocaleDateString() : undefined}
                        daysRemaining={av1onicsAudit.checks?.elt?.daysRemaining}
                        message={av1onicsAudit.checks?.elt?.message || 'ELT inspection'}
                      />
                      <AV1ONICSCheckItem
                        code="C"
                        name="Compass"
                        icon={Compass}
                        status={av1onicsAudit.checks?.compass?.status || 'na'}
                        message={av1onicsAudit.checks?.compass?.message || 'Compass swing'}
                      />
                      <AV1ONICSCheckItem
                        code="S"
                        name="Static"
                        icon={Wind}
                        status={av1onicsAudit.checks?.staticSystem?.status || 'na'}
                        dueDate={av1onicsAudit.checks?.staticSystem?.dueDate ? new Date(av1onicsAudit.checks.staticSystem.dueDate).toLocaleDateString() : undefined}
                        daysRemaining={av1onicsAudit.checks?.staticSystem?.daysRemaining}
                        message={av1onicsAudit.checks?.staticSystem?.message || 'Static system'}
                      />
                    </div>

                    {/* Critical Issues & Warnings */}
                    {(av1onicsAudit.criticalIssues?.length > 0 || av1onicsAudit.warnings?.length > 0) && (
                      <div className="mt-6 pt-6 border-t border-zinc-200">
                        {av1onicsAudit.criticalIssues?.length > 0 && (
                          <div className="mb-4">
                            <h4 className="font-semibold text-red-600 mb-2 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4" />
                              Critical Issues
                            </h4>
                            <ul className="space-y-1">
                              {av1onicsAudit.criticalIssues.map((issue: string, idx: number) => (
                                <li key={idx} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                                  {issue}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {av1onicsAudit.warnings?.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-amber-600 mb-2 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />
                              Warnings
                            </h4>
                            <ul className="space-y-1">
                              {av1onicsAudit.warnings.map((warning: string, idx: number) => (
                                <li key={idx} className="text-sm text-amber-600 bg-amber-50 p-2 rounded">
                                  {warning}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* MEL/KOEL Status */}
                <MELStatusCard
                  requiresMEL={av1onicsAudit?.melCheck?.requiresMEL || false}
                  melUploaded={av1onicsAudit?.melCheck?.melUploaded || false}
                  inoperativeCount={av1onicsAudit?.melCheck?.inoperativeItems?.length || 0}
                  onUploadMEL={() => {
                    // Trigger MEL upload modal
                    document.getElementById('mel-upload-input')?.click();
                  }}
                />

                {/* Aircraft Logbook */}
                <div className="bg-white rounded-xl border border-zinc-200 p-6">
                  <LogbookUI
                    mode="aircraft"
                    title={`${selectedAircraft.tailNumber} Maintenance Logbook`}
                    entries={getLogbookEntries(selectedAircraft)}
                    categories={['engine', 'airframe', 'propeller', 'avionics']}
                    summary={{
                      totalEntries: getLogbookEntries(selectedAircraft).length,
                      totalHours: selectedAircraft.currentHours?.hobbs || 0,
                    }}
                    onUpload={handleUpload}
                    isUploading={isUploading}
                    uploadProgress={uploadProgress}
                    linkedDocuments={(selectedAircraft as any).linkedDocuments?.map((doc: any) => ({
                      id: doc._id || doc,
                      filename: doc.filename || 'Document',
                      type: doc.documentType || 'maintenance',
                      uploadedAt: doc.uploadedAt || new Date().toISOString(),
                    })) || []}
                  />
                </div>

                {/* Hidden MEL upload input */}
                <input
                  id="mel-upload-input"
                  type="file"
                  className="hidden"
                  accept="application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      // Handle MEL upload
                      handleUpload(file, 'mel');
                    }
                    e.target.value = '';
                  }}
                />
              </>
            ) : (
              /* No Aircraft Selected */
              <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
                <Plane className="w-16 h-16 text-zinc-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-zinc-900 mb-2">
                  Select an Aircraft
                </h3>
                <p className="text-zinc-500 max-w-md mx-auto">
                  Choose an aircraft from the list to view its AV1ONICS compliance status,
                  maintenance logbook, and MEL/KOEL configuration.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
