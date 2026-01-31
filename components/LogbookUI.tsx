'use client';

import { useState, useCallback } from 'react';
import {
  FileText,
  Upload,
  Calendar,
  Clock,
  Hash,
  ChevronDown,
  ChevronUp,
  Plane,
  Wrench,
  Cog,
  CircleDot,
  Cpu,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Filter,
  Search,
  Download,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

// Logbook entry types
export interface ILogbookEntry {
  id?: string;
  date: string;
  description: string;
  hobbsTime?: number;
  tachTime?: number;
  totalTime?: number;
  mechanic?: string;
  category?: 'engine' | 'airframe' | 'propeller' | 'avionics';
  // Pilot logbook specific
  from?: string;
  to?: string;
  aircraftIdent?: string;
  aircraftType?: string;
  pic?: number;
  remarks?: string;
}

// Component props
export interface LogbookUIProps {
  // Mode: pilot or aircraft
  mode: 'pilot' | 'aircraft';

  // Entries to display
  entries: ILogbookEntry[];

  // Category filter (aircraft only)
  categories?: ('engine' | 'airframe' | 'propeller' | 'avionics')[];

  // Title
  title?: string;

  // Summary data
  summary?: {
    totalEntries: number;
    totalHours?: number;
    dateRange?: { from: string; to: string };
  };

  // Upload handling
  onUpload?: (file: File, category?: string) => Promise<void>;
  isUploading?: boolean;
  uploadProgress?: number;

  // Entry management
  onAddEntry?: (entry: ILogbookEntry) => void;
  onDeleteEntry?: (entryId: string) => void;

  // Loading state
  isLoading?: boolean;

  // Linked document info
  linkedDocuments?: {
    id: string;
    filename: string;
    type: string;
    uploadedAt: string;
  }[];
}

// Category configuration
const CATEGORIES = {
  engine: {
    label: 'Engine',
    icon: Cog,
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    description: 'Engine maintenance, oil changes, overhauls',
  },
  airframe: {
    label: 'Airframe',
    icon: Plane,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    description: 'Structural, annual, 100-hour inspections',
  },
  propeller: {
    label: 'Propeller',
    icon: CircleDot,
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    description: 'Prop service, overhaul, AD compliance',
  },
  avionics: {
    label: 'Avionics',
    icon: Cpu,
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    description: 'Radios, transponder, GPS, autopilot',
  },
};

export function LogbookUI({
  mode,
  entries,
  categories = ['engine', 'airframe', 'propeller', 'avionics'],
  title,
  summary,
  onUpload,
  isUploading = false,
  uploadProgress = 0,
  onAddEntry,
  onDeleteEntry,
  isLoading = false,
  linkedDocuments = [],
}: LogbookUIProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string | null>(null);

  // Filter entries
  const filteredEntries = entries.filter(entry => {
    // Category filter (aircraft mode)
    if (mode === 'aircraft' && activeCategory && entry.category !== activeCategory) {
      return false;
    }
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        entry.description?.toLowerCase().includes(query) ||
        entry.mechanic?.toLowerCase().includes(query) ||
        entry.remarks?.toLowerCase().includes(query) ||
        entry.from?.toLowerCase().includes(query) ||
        entry.to?.toLowerCase().includes(query) ||
        entry.aircraftIdent?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Toggle entry expansion
  const toggleEntry = (entryId: string) => {
    setExpandedEntries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
      }
      return newSet;
    });
  };

  // Handle file drop
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file && onUpload) {
      await onUpload(file, uploadCategory || undefined);
    }
  }, [onUpload, uploadCategory]);

  // Handle file input
  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, category?: string) => {
    const file = e.target.files?.[0];
    if (file && onUpload) {
      await onUpload(file, category);
    }
    e.target.value = '';
  }, [onUpload]);

  // Get category stats
  const getCategoryStats = (cat: string) => {
    const catEntries = entries.filter(e => e.category === cat);
    const totalHours = catEntries.reduce((acc, e) => acc + (e.hobbsTime || e.tachTime || 0), 0);
    return {
      count: catEntries.length,
      totalHours: totalHours.toFixed(1),
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {title || (mode === 'pilot' ? 'Pilot Logbook' : 'Aircraft Logbook')}
          </h2>
          {summary && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              {summary.totalEntries} entries
              {summary.totalHours !== undefined && ` | ${summary.totalHours.toFixed(1)} total hours`}
              {summary.dateRange && ` | ${summary.dateRange.from} - ${summary.dateRange.to}`}
            </p>
          )}
        </div>
        {onAddEntry && (
          <Button size="sm" onClick={() => onAddEntry({
            date: new Date().toISOString().split('T')[0],
            description: '',
          })}>
            <Plus className="w-4 h-4 mr-2" />
            Add Entry
          </Button>
        )}
      </div>

      {/* Category Tabs (Aircraft Mode) */}
      {mode === 'aircraft' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {categories.map(cat => {
            const config = CATEGORIES[cat];
            const Icon = config.icon;
            const stats = getCategoryStats(cat);
            const isActive = activeCategory === cat;

            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(isActive ? null : cat)}
                className={cn(
                  "p-4 rounded-xl border-2 transition-all text-left",
                  isActive
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg", config.color)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">{config.label}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {stats.count} entries
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Upload Zone */}
      {onUpload && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 transition-all",
            isDragging
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
              : "border-zinc-300 dark:border-zinc-600 hover:border-blue-400"
          )}
        >
          {isUploading ? (
            <div className="flex flex-col items-center">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
              <p className="font-medium text-zinc-700 dark:text-zinc-300">Processing document...</p>
              <div className="w-full max-w-xs mt-4">
                <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Upload className="w-10 h-10 text-zinc-400 mb-3" />
              <p className="font-medium text-zinc-700 dark:text-zinc-300">
                Drop {mode === 'aircraft' ? 'maintenance records' : 'logbook pages'} here
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                PDF or Image (max 50MB)
              </p>

              {/* Category-specific upload buttons (Aircraft Mode) */}
              {mode === 'aircraft' && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {categories.map(cat => {
                    const config = CATEGORIES[cat];
                    const Icon = config.icon;
                    return (
                      <label
                        key={cat}
                        className={cn(
                          "inline-flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all",
                          config.color,
                          "hover:opacity-80"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-sm font-medium">{config.label}</span>
                        <input
                          type="file"
                          className="hidden"
                          accept="application/pdf,image/*"
                          onChange={(e) => handleFileInput(e, cat)}
                        />
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Generic upload for pilot mode */}
              {mode === 'pilot' && (
                <label className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg cursor-pointer hover:bg-blue-200 transition-colors">
                  <FileText className="w-4 h-4" />
                  <span className="text-sm font-medium">Browse Files</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="application/pdf,image/*"
                    onChange={(e) => handleFileInput(e)}
                  />
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          type="text"
          placeholder="Search entries..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
        />
      </div>

      {/* Entries List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700">
          <FileText className="w-12 h-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-500 dark:text-zinc-400">
            {entries.length === 0
              ? 'No logbook entries yet. Upload a document to get started.'
              : 'No entries match your search.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEntries.map((entry, idx) => {
            const entryId = entry.id || `entry-${idx}`;
            const isExpanded = expandedEntries.has(entryId);
            const catConfig = entry.category ? CATEGORIES[entry.category] : null;

            return (
              <div
                key={entryId}
                className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden"
              >
                {/* Entry Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                  onClick={() => toggleEntry(entryId)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      {/* Category Badge (Aircraft) */}
                      {mode === 'aircraft' && catConfig && (
                        <div className={cn("p-2 rounded-lg", catConfig.color)}>
                          <catConfig.icon className="w-4 h-4" />
                        </div>
                      )}

                      {/* Entry Info */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {entry.date}
                          </span>
                          {mode === 'aircraft' && entry.mechanic && (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              by {entry.mechanic}
                            </span>
                          )}
                          {mode === 'pilot' && entry.aircraftIdent && (
                            <Badge variant="outline" className="text-xs">
                              {entry.aircraftIdent}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 line-clamp-1">
                          {entry.description || entry.remarks || (mode === 'pilot' && entry.from && entry.to ? `${entry.from} → ${entry.to}` : 'No description')}
                        </p>
                      </div>
                    </div>

                    {/* Time/Hours */}
                    <div className="flex items-center gap-4">
                      {(entry.hobbsTime || entry.tachTime || entry.totalTime) && (
                        <div className="text-right">
                          <p className="font-semibold text-blue-600 dark:text-blue-400">
                            {(entry.hobbsTime || entry.tachTime || entry.totalTime)?.toFixed(1)} hrs
                          </p>
                          {entry.hobbsTime && entry.tachTime && (
                            <p className="text-xs text-zinc-500">
                              H: {entry.hobbsTime} / T: {entry.tachTime}
                            </p>
                          )}
                        </div>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-zinc-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-zinc-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-zinc-100 dark:border-zinc-700">
                    {/* Full Description */}
                    {(entry.description || entry.remarks) && (
                      <div className="mb-3">
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {entry.description || entry.remarks}
                        </p>
                      </div>
                    )}

                    {/* Pilot-specific details */}
                    {mode === 'pilot' && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        {entry.from && entry.to && (
                          <div className="bg-zinc-50 dark:bg-zinc-900 p-2 rounded">
                            <span className="text-zinc-500">Route</span>
                            <p className="font-medium">{entry.from} → {entry.to}</p>
                          </div>
                        )}
                        {entry.pic && (
                          <div className="bg-zinc-50 dark:bg-zinc-900 p-2 rounded">
                            <span className="text-zinc-500">PIC</span>
                            <p className="font-medium">{entry.pic} hrs</p>
                          </div>
                        )}
                        {entry.aircraftType && (
                          <div className="bg-zinc-50 dark:bg-zinc-900 p-2 rounded">
                            <span className="text-zinc-500">Type</span>
                            <p className="font-medium">{entry.aircraftType}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Aircraft-specific details */}
                    {mode === 'aircraft' && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        {entry.hobbsTime && (
                          <div className="bg-zinc-50 dark:bg-zinc-900 p-2 rounded">
                            <span className="text-zinc-500">Hobbs</span>
                            <p className="font-medium">{entry.hobbsTime}</p>
                          </div>
                        )}
                        {entry.tachTime && (
                          <div className="bg-zinc-50 dark:bg-zinc-900 p-2 rounded">
                            <span className="text-zinc-500">Tach</span>
                            <p className="font-medium">{entry.tachTime}</p>
                          </div>
                        )}
                        {entry.mechanic && (
                          <div className="bg-zinc-50 dark:bg-zinc-900 p-2 rounded">
                            <span className="text-zinc-500">Mechanic</span>
                            <p className="font-medium">{entry.mechanic}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delete button */}
                    {onDeleteEntry && entry.id && (
                      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-700">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteEntry(entry.id!)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Entry
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Linked Documents */}
      {linkedDocuments.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
            Linked Documents
          </h3>
          <div className="flex flex-wrap gap-2">
            {linkedDocuments.map(doc => (
              <div
                key={doc.id}
                className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-sm"
              >
                <FileText className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-700 dark:text-zinc-300">{doc.filename}</span>
                <Badge variant="outline" className="text-xs">{doc.type}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default LogbookUI;
