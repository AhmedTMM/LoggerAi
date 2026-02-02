import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Aircraft, { LogbookCategory } from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';
import { parseDocumentUltraFast } from '@/lib/services/reductoService';
import { runLegalityAudit } from '@/lib/services/auditEngine';
import { generateSafetyAnalysis } from '@/lib/services/safetyAnalysisService';
import { invalidateAllCaches } from '@/lib/services/autoAttachService';

// Simple in-memory job queue
interface UploadJob {
  documentId: string;
  fileBase64: string;
  fileType: string;
  filename: string;
  userId: string;
  documentType: string;
  pilotId?: string;
  aircraftId?: string;
  categoryFromFilename?: LogbookCategory;
}

const jobQueue: UploadJob[] = [];
let isProcessing = false;

// Add a job to the queue
export function enqueueUploadJob(job: UploadJob) {
  jobQueue.push(job);
  processQueue(); // Start processing if not already running
}

// Process jobs in the queue
async function processQueue() {
  if (isProcessing || jobQueue.length === 0) return;

  isProcessing = true;

  while (jobQueue.length > 0) {
    const job = jobQueue.shift();
    if (job) {
      try {
        await processUploadJob(job);
      } catch (error) {
        console.error('Background job failed:', error);
      }
    }
  }

  isProcessing = false;
}

// Process a single upload job
async function processUploadJob(job: UploadJob) {
  const { documentId, fileBase64, fileType, filename, userId, documentType, pilotId, aircraftId, categoryFromFilename } = job;

  console.log(`[BackgroundProcessor] Starting job for document ${documentId}`);

  try {
    await dbConnect();

    // Update status to parsing
    await ParsedDocument.findByIdAndUpdate(documentId, {
      status: 'parsing',
      progress: 10,
      progressStep: 'processing',
    });

    // Parse the document using Reducto OCR + Gemini (high quality)
    const parseType = documentType === 'poh' ? 'logbook' : documentType;
    const { parseDocumentFast } = await import('@/lib/services/reductoService');
    const result = await parseDocumentFast(
      fileBase64,
      fileType,
      parseType,
      async (log) => {
        const mappedProgress = 10 + Math.round((log.progress / 100) * 70);
        await ParsedDocument.findByIdAndUpdate(documentId, {
          progress: mappedProgress,
          progressStep: 'extracting',
        });
      }
    );

    if (!result.success) {
      await ParsedDocument.findByIdAndUpdate(documentId, {
        status: 'failed',
        progressStep: 'failed',
        error: result.error,
      });
      return;
    }

    const entries = result.data?.extractedData?.entries ||
      (Array.isArray(result.data?.extractedData) ? result.data?.extractedData : []);

    const summary = calculateSummary(entries);

    // Update document with parsed data
    await ParsedDocument.findByIdAndUpdate(documentId, {
      status: 'completed',
      progress: 90,
      progressStep: 'processing',
      parsedAt: new Date(),
      rawOutput: result.data?.extractedData,
      entries,
      summary,
    });

    // Update pilot experience from logbook
    if (pilotId && ['pilot_logbook', 'logbook'].includes(documentType) && entries.length > 0) {
      await updatePilotExperience(pilotId, entries);
    }

    // Update aircraft from maintenance docs
    if (aircraftId && ['aircraft_logbook', 'maintenance', 'inspection'].includes(documentType) && entries.length > 0) {
      await updateAircraftFromEntries(aircraftId, entries, categoryFromFilename, userId);
    }

    // Run audit if we have both pilot and aircraft
    let auditStatus: string | undefined;
    if (pilotId && aircraftId) {
      try {
        const pilot = await Pilot.findById(pilotId);
        const aircraft = await Aircraft.findById(aircraftId);
        if (pilot && aircraft) {
          const auditResult = await runLegalityAudit(aircraft, pilot, new Date(), 'KJFK');
          auditStatus = auditResult.overallStatus;

          // Store audit results on pilot
          await Pilot.findByIdAndUpdate(pilotId, {
            safetyAnalysis: {
              lastAnalyzed: new Date(),
              score: auditStatus === 'go' ? 100 : auditStatus === 'caution' ? 70 : 30,
              findings: auditResult.checks.map(c => ({
                category: c.category,
                riskLevel: c.status === 'fail' ? 'high' : c.status === 'warning' ? 'medium' : 'low',
                message: c.message,
              })),
            },
          });
        }
      } catch (auditError) {
        console.error('Audit error:', auditError);
      }
    }

    // Final update
    await ParsedDocument.findByIdAndUpdate(documentId, {
      status: 'completed',
      progress: 100,
      progressStep: 'complete',
    });

    console.log(`[BackgroundProcessor] Completed job for document ${documentId} (${entries.length} entries)`);

  } catch (error) {
    console.error(`[BackgroundProcessor] Error processing document ${documentId}:`, error);
    await ParsedDocument.findByIdAndUpdate(documentId, {
      status: 'failed',
      progressStep: 'failed',
      error: (error as Error).message,
    });
  }
}

function calculateSummary(entries: any[]) {
  if (!entries || entries.length === 0) {
    return { totalEntries: 0 };
  }

  const totalHours = entries.reduce((sum, e) => sum + (e.totalTime || e.duration || 0), 0);
  const dates = entries.map(e => e.date).filter(Boolean).sort();

  return {
    totalEntries: entries.length,
    totalHours: Math.round(totalHours * 10) / 10,
    dateRange: dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : undefined,
  };
}

async function updatePilotExperience(pilotId: string, entries: any[]) {
  const pilot = await Pilot.findById(pilotId);
  if (!pilot) return;

  let flatEntries = entries;
  if (entries.length === 1 && entries[0].flights) {
    flatEntries = entries[0].flights;
  }

  // Create flight entries
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

  // Calculate experience totals
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

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
    totalHours: Math.round(totalHours * 10) / 10,
    picHours: Math.round(picHours * 10) / 10,
    nightHours: Math.round(nightHours * 10) / 10,
    ifrHours: Math.round(ifrHours * 10) / 10,
    crossCountryHours: Math.round(crossCountryHours * 10) / 10,
    last90DaysHours: Math.round(last90DaysHours * 10) / 10,
    last30DaysHours: Math.round(last30DaysHours * 10) / 10,
  };

  await pilot.save();
}

async function updateAircraftFromEntries(
  aircraftId: string,
  entries: any[],
  filenameCategory?: LogbookCategory,
  userId?: string
) {
  const aircraft = await Aircraft.findById(aircraftId);
  if (!aircraft) return;

  // Ensure userId is set
  if (!aircraft.userId && userId) {
    aircraft.userId = userId;
  }

  // Extract maintenance info
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
      // Check structured fields first
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

      // Fall back to description text parsing
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

  // Update maintenance dates
  if (latestAnnual) aircraft.maintenanceDates.annual = latestAnnual;
  if (latestTransponder) aircraft.maintenanceDates.transponder = latestTransponder;
  if (latestStatic) aircraft.maintenanceDates.staticSystem = latestStatic;
  if (latestHundredHour) aircraft.maintenanceDates.hundredHour = latestHundredHour;

  // Update airworthinessStatus
  if (!aircraft.airworthinessStatus) {
    aircraft.airworthinessStatus = {};
  }
  if (latestAnnual) aircraft.airworthinessStatus.annual = latestAnnual;
  if (latestTransponder) aircraft.airworthinessStatus.transponder = latestTransponder;
  if (latestStatic) aircraft.airworthinessStatus.staticSystem = latestStatic;
  if (latestElt) aircraft.airworthinessStatus.elt = latestElt;
  if (latestHundredHour) aircraft.airworthinessStatus.hundredHour = latestHundredHour;

  // Update hours
  if (maxHobbs > aircraft.currentHours.hobbs) aircraft.currentHours.hobbs = maxHobbs;
  if (maxTach > aircraft.currentHours.tach) aircraft.currentHours.tach = maxTach;

  // Build log entries with category detection
  const detectEntryCategory = (description: string): LogbookCategory => {
    const lower = (description || '').toLowerCase();
    if (lower.includes('engine') || lower.includes('cylinder') || lower.includes('magneto') ||
        lower.includes('spark plug') || lower.includes('oil change') || lower.includes('compression')) return 'engine';
    if (lower.includes('propeller') || lower.includes('prop ')) return 'propeller';
    if (lower.includes('avionics') || lower.includes('radio') || lower.includes('transponder') ||
        lower.includes('gps') || lower.includes('gia') || lower.includes('gdu') || lower.includes('comm')) return 'avionics';
    return 'airframe';
  };

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
    // Add to general logs
    aircraft.logs.push(...newLogs);

    // Initialize categorized logbooks if needed
    if (!aircraft.logbooks) {
      aircraft.logbooks = {
        engine: [],
        airframe: [],
        propeller: [],
        avionics: [],
      };
    }

    // Add entries to categorized logbooks
    for (const log of newLogs) {
      const cat = log.category || 'airframe';
      (aircraft.logbooks as any)[cat].push(log);
    }
  }

  // Generate safety analysis
  const safetyAnalysis = generateSafetyAnalysis(entries, aircraft);
  aircraft.safetyAnalysis = safetyAnalysis;

  await aircraft.save();
  invalidateAllCaches();
}
