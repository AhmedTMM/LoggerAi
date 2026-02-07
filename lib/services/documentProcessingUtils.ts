/**
 * Document processing utilities.
 *
 * All document-related domain logic in one place:
 *   - Flight status display config (GO / CAUTION / NO-GO)
 *   - Summary calculation (hours, date ranges)
 *   - Logbook entry category detection (engine, propeller, avionics, airframe)
 *   - Pilot experience aggregation from logbook entries
 *   - Aircraft maintenance / hours updates from parsed entries
 */

import Aircraft, { LogbookCategory } from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';
import { generateSafetyAnalysis } from '@/lib/services/safetyAnalysisService';
import { invalidateAllCaches } from '@/lib/services/autoAttachService';

// ============ FLIGHT STATUS CONFIG ============

export type FlightStatusType = 'go' | 'caution' | 'no-go';

export interface StatusConfig {
  emoji: string;
  text: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  isDangerous: boolean;
}

const STATUS_CONFIG: Record<FlightStatusType, StatusConfig> = {
  'go': {
    emoji: '✅',
    text: 'GO - Flight Approved',
    shortLabel: 'GO',
    color: '#10b981',
    bgColor: '#ecfdf5',
    isDangerous: false,
  },
  'caution': {
    emoji: '⚠️',
    text: 'CAUTION - Review Required',
    shortLabel: 'CAUTION',
    color: '#f59e0b',
    bgColor: '#fffbeb',
    isDangerous: true,
  },
  'no-go': {
    emoji: '❌',
    text: 'NO-GO - Flight Not Recommended',
    shortLabel: 'NO-GO',
    color: '#ef4444',
    bgColor: '#fef2f2',
    isDangerous: true,
  },
};

export function getStatusConfig(status: FlightStatusType | string): StatusConfig {
  return STATUS_CONFIG[status as FlightStatusType] || STATUS_CONFIG['no-go'];
}

// ============ TIME CONSTANTS ============

export const MS_PER_DAY = 86_400_000;
export const DAYS_30_MS = 30 * MS_PER_DAY;
export const DAYS_90_MS = 90 * MS_PER_DAY;

// ============ MATH HELPERS ============

/** Round a number to one decimal place. */
export function roundToTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

// ============ ENTRY CATEGORY DETECTION ============

/** Detect logbook entry category from description text. */
export function detectEntryCategory(description: string): LogbookCategory {
  const lower = (description || '').toLowerCase();
  if (
    lower.includes('engine') || lower.includes('cylinder') || lower.includes('magneto') ||
    lower.includes('spark plug') || lower.includes('oil change') || lower.includes('compression')
  ) return 'engine';
  if (lower.includes('propeller') || lower.includes('prop ')) return 'propeller';
  if (
    lower.includes('avionics') || lower.includes('radio') || lower.includes('transponder') ||
    lower.includes('gps') || lower.includes('gia') || lower.includes('gdu') || lower.includes('comm')
  ) return 'avionics';
  return 'airframe';
}

// ============ SUMMARY CALCULATION ============

/**
 * Calculate summary statistics from parsed entries.
 *
 * For pilot logbooks: sums flight times.
 * For aircraft logbooks: shows the latest Hobbs/Tach (not summed).
 */
export function calculateSummary(entries: any[], documentType?: string) {
  if (!entries || entries.length === 0) {
    return { totalEntries: 0 };
  }

  const dates = entries.map(e => e.date).filter(Boolean).sort();
  const dateRange = dates.length > 0
    ? { from: dates[0], to: dates[dates.length - 1] }
    : undefined;

  const isAircraftLog = documentType === 'aircraft_logbook' || documentType === 'maintenance';

  if (isAircraftLog) {
    let maxHobbs = 0;
    let maxTach = 0;
    for (const entry of entries) {
      if (entry.hobbsTime && entry.hobbsTime > maxHobbs) maxHobbs = entry.hobbsTime;
      if (entry.tachTime && entry.tachTime > maxTach) maxTach = entry.tachTime;
    }
    const latestHours = maxHobbs > 0 ? maxHobbs : maxTach;

    return {
      totalEntries: entries.length,
      totalHours: latestHours > 0 ? roundToTenths(latestHours) : 0,
      dateRange,
      isLatestValue: true,
    };
  }

  // Pilot logbook — sum all flight times.
  const totalHours = entries.reduce((sum, e) => sum + (e.totalTime || e.duration || 0), 0);

  return {
    totalEntries: entries.length,
    totalHours: roundToTenths(totalHours),
    dateRange,
  };
}

// ============ PILOT EXPERIENCE ============

/** Update pilot experience totals from logbook entries. */
export async function updatePilotExperience(pilotId: string, entries: any[]) {
  const pilot = await Pilot.findById(pilotId);
  if (!pilot) return;

  // Flatten if entries are wrapped in a single { flights: [...] } object.
  let flatEntries = entries;
  if (entries.length === 1 && entries[0].flights) {
    flatEntries = entries[0].flights;
  }

  const flightEntries = flatEntries.map((e: any) => ({
    date: e.date || '',
    aircraftIdent: e.aircraftIdent || e.aircraft || '',
    aircraftType: e.aircraftType || '',
    from: e.from || '',
    to: e.to || '',
    route: e.route || '',
    totalTime: e.totalTime || e.duration || 0,
    pic: e.pic || 0,
    sic: e.sic || 0,
    solo: e.solo || 0,
    dualReceived: e.dualReceived || 0,
    dualGiven: e.dualGiven || 0,
    crossCountry: e.crossCountry || 0,
    night: e.night || 0,
    actualInstrument: e.actualInstrument || 0,
    simulatedInstrument: e.simulatedInstrument || 0,
    sel: e.sel || 0,
    mel: e.mel || 0,
    landingsDay: e.landingsFullStopDay || e.landingsDay || 0,
    landingsNight: e.landingsFullStopNight || e.landingsNight || 0,
    landingsTotal: e.landingsTotal || 0,
    remarks: e.remarks || '',
  })).filter((e: any) => e.date && e.aircraftIdent);

  pilot.flightEntries = flightEntries;

  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - DAYS_90_MS);
  const thirtyDaysAgo = new Date(now.getTime() - DAYS_30_MS);

  let totalHours = 0, picHours = 0, nightHours = 0, ifrHours = 0, crossCountryHours = 0;
  let last90DaysHours = 0, last30DaysHours = 0;

  for (const entry of flightEntries) {
    totalHours += entry.totalTime;
    picHours += entry.pic || 0;
    nightHours += entry.night || 0;
    ifrHours += (entry.actualInstrument || 0) + (entry.simulatedInstrument || 0);
    crossCountryHours += entry.crossCountry || 0;

    if (entry.date) {
      const entryDate = new Date(entry.date);
      if (!isNaN(entryDate.getTime())) {
        if (entryDate >= ninetyDaysAgo) last90DaysHours += entry.totalTime;
        if (entryDate >= thirtyDaysAgo) last30DaysHours += entry.totalTime;
      }
    }
  }

  pilot.experience = {
    totalHours: roundToTenths(totalHours),
    picHours: roundToTenths(picHours),
    nightHours: roundToTenths(nightHours),
    ifrHours: roundToTenths(ifrHours),
    crossCountryHours: roundToTenths(crossCountryHours),
    last90DaysHours: roundToTenths(last90DaysHours),
    last30DaysHours: roundToTenths(last30DaysHours),
  };

  await pilot.save();
}

// ============ AIRCRAFT UPDATES ============

/** Update aircraft maintenance dates and logs from parsed entries. */
export async function updateAircraftFromEntries(
  aircraftId: string,
  entries: any[],
  filenameCategory?: LogbookCategory,
  userId?: string,
) {
  const aircraft = await Aircraft.findById(aircraftId);
  if (!aircraft) return;

  if (!aircraft.userId && userId) {
    aircraft.userId = userId;
  }

  // ---- Extract latest inspection dates ----
  let latestAnnual: Date | null = null;
  let latestTransponder: Date | null = null;
  let latestStatic: Date | null = null;
  let latestElt: Date | null = null;
  let latestHundredHour: Date | null = null;
  let maxHobbs = aircraft.currentHours.hobbs;
  let maxTach = aircraft.currentHours.tach;

  for (const entry of entries) {
    const entryDate = entry.date ? new Date(entry.date) : null;
    const desc = (entry.description || '').toLowerCase();

    if (entryDate && !isNaN(entryDate.getTime())) {
      // Check structured inspection types
      if (entry.isInspection && entry.inspectionType) {
        const inspType = entry.inspectionType.toLowerCase();
        if (inspType === 'annual' || inspType.includes('annual')) {
          if (!latestAnnual || entryDate > latestAnnual) latestAnnual = entryDate;
        }
        if (inspType === '100hour' || inspType.includes('100')) {
          if (!latestHundredHour || entryDate > latestHundredHour) latestHundredHour = entryDate;
        }
        if (inspType === 'transponder' || inspType.includes('transponder')) {
          if (!latestTransponder || entryDate > latestTransponder) latestTransponder = entryDate;
        }
        if (inspType === 'static' || inspType.includes('static') || inspType.includes('altimeter')) {
          if (!latestStatic || entryDate > latestStatic) latestStatic = entryDate;
        }
        if (inspType === 'elt' || inspType.includes('elt')) {
          if (!latestElt || entryDate > latestElt) latestElt = entryDate;
        }
      }

      // Fallback: match keywords in description text
      if (desc.includes('annual') && !desc.includes('100')) {
        if (!latestAnnual || entryDate > latestAnnual) latestAnnual = entryDate;
      }
      if (desc.includes('100 hour') || desc.includes('100hr') || desc.includes('100-hour')) {
        if (!latestHundredHour || entryDate > latestHundredHour) latestHundredHour = entryDate;
      }
      if (desc.includes('transponder')) {
        if (!latestTransponder || entryDate > latestTransponder) latestTransponder = entryDate;
      }
      if (desc.includes('static') || desc.includes('altimeter')) {
        if (!latestStatic || entryDate > latestStatic) latestStatic = entryDate;
      }
      if (desc.includes('elt') || desc.includes('emergency locator')) {
        if (!latestElt || entryDate > latestElt) latestElt = entryDate;
      }
    }

    if (entry.hobbsTime && entry.hobbsTime > maxHobbs) maxHobbs = entry.hobbsTime;
    if (entry.tachTime && entry.tachTime > maxTach) maxTach = entry.tachTime;
  }

  // ---- Apply inspection dates ----
  if (latestAnnual) aircraft.maintenanceDates.annual = latestAnnual;
  if (latestTransponder) aircraft.maintenanceDates.transponder = latestTransponder;
  if (latestStatic) aircraft.maintenanceDates.staticSystem = latestStatic;
  if (latestHundredHour) aircraft.maintenanceDates.hundredHour = latestHundredHour;

  if (!aircraft.airworthinessStatus) {
    aircraft.airworthinessStatus = {};
  }
  if (latestAnnual) aircraft.airworthinessStatus.annual = latestAnnual;
  if (latestTransponder) aircraft.airworthinessStatus.transponder = latestTransponder;
  if (latestStatic) aircraft.airworthinessStatus.staticSystem = latestStatic;
  if (latestElt) aircraft.airworthinessStatus.elt = latestElt;
  if (latestHundredHour) aircraft.airworthinessStatus.hundredHour = latestHundredHour;

  // ---- Apply hours ----
  if (maxHobbs > aircraft.currentHours.hobbs) aircraft.currentHours.hobbs = maxHobbs;
  if (maxTach > aircraft.currentHours.tach) aircraft.currentHours.tach = maxTach;

  // ---- Append log entries ----
  const newLogs = entries.map((entry: any) => {
    const description = entry.description || entry.workPerformed || 'Maintenance entry';
    const category = filenameCategory || detectEntryCategory(description);

    return {
      date: entry.date ? new Date(entry.date) : new Date(),
      description,
      hobbsTime: entry.hobbsTime || aircraft.currentHours.hobbs,
      tachTime: entry.tachTime || aircraft.currentHours.tach,
      mechanic: entry.mechanic || entry.signedBy,
      category,
    };
  }).filter(log => log.description !== 'Maintenance entry');

  if (newLogs.length > 0) {
    aircraft.logs.push(...newLogs);

    if (!aircraft.logbooks) {
      aircraft.logbooks = {
        engine: [],
        airframe: [],
        propeller: [],
        avionics: [],
      };
    }

    for (const log of newLogs) {
      const cat = log.category || 'airframe';
      (aircraft.logbooks as any)[cat].push(log);
    }
  }

  // ---- Regenerate safety analysis ----
  const safetyAnalysis = generateSafetyAnalysis(entries, aircraft);
  aircraft.safetyAnalysis = safetyAnalysis;

  await aircraft.save();
  invalidateAllCaches();
}
