import { NextRequest } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Aircraft, { LogbookCategory } from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';
import { parseDocumentUltraFast } from '@/lib/services/reductoService';
import { classifyDocumentFast } from '@/lib/services/aiService';
import { saveFile } from '@/lib/services/fileStorage';
import { runLegalityAudit } from '@/lib/services/auditEngine';
import {
  mapDetectedTypeToStorageType,
  isPilotDocument,
  isAircraftDocument,
  invalidateAllCaches
} from '@/lib/services/autoAttachService';

export const maxDuration = 300;

const MONGODB_SAFE_SIZE = 10 * 1024 * 1024;

// ============ FILENAME-BASED FALLBACK EXTRACTION ============
// Extract tail number from filename (e.g., "N6196P-Airframe-Log-1.pdf" -> "N6196P")
function extractTailFromFilename(filename: string): string | null {
  if (!filename) return null;
  // Pattern: N followed by up to 5 alphanumeric chars
  const match = filename.match(/\b(N[0-9A-Z]{1,5})\b/i);
  return match ? match[1].toUpperCase() : null;
}

// Extract logbook category from filename
function extractCategoryFromFilename(filename: string): LogbookCategory | null {
  if (!filename) return null;
  const lower = filename.toLowerCase();
  if (lower.includes('engine')) return 'engine';
  if (lower.includes('airframe')) return 'airframe';
  if (lower.includes('propeller') || lower.includes('prop')) return 'propeller';
  if (lower.includes('avionics')) return 'avionics';
  return null;
}

// Detect entry category from description content
function detectEntryCategory(description: string): LogbookCategory {
  const lower = (description || '').toLowerCase();
  if (lower.includes('engine') || lower.includes('cylinder') || lower.includes('magneto') ||
      lower.includes('spark plug') || lower.includes('oil change') || lower.includes('compression')) return 'engine';
  if (lower.includes('propeller') || lower.includes('prop ')) return 'propeller';
  if (lower.includes('avionics') || lower.includes('radio') || lower.includes('transponder') ||
      lower.includes('gps') || lower.includes('gia') || lower.includes('gdu') || lower.includes('comm')) return 'avionics';
  return 'airframe'; // default
}

function formatSSE(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const send = (data: any) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(formatSSE(data)));
        } catch {
          isClosed = true;
        }
      };

      const safeClose = () => {
        if (isClosed) return;
        isClosed = true;
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      const progress = (percent: number, message: string) => {
        send({ type: 'progress', progress: percent, message });
      };

      try {
        // Parse request
        let body;
        try {
          body = await request.json();
        } catch {
          send({ type: 'error', message: 'Failed to parse request' });
          safeClose();
          return;
        }

        const { fileBase64, fileType, filename } = body;
        if (!fileBase64 || !fileType) {
          send({ type: 'error', message: 'Missing fileBase64 or fileType' });
          safeClose();
          return;
        }

        const fileSizeBytes = Math.ceil((fileBase64.length * 3) / 4);
        if (fileSizeBytes > 50 * 1024 * 1024) {
          send({ type: 'error', message: 'File too large (max 50MB)' });
          safeClose();
          return;
        }

        progress(5, 'Connecting to database...');
        await dbConnect();

        progress(10, 'Analyzing document with AI...');

        // Classify document
        const classification = await classifyDocumentFast(fileBase64, fileType);
        let documentType = 'other';
        let analysis: any = null;

        if (classification.success && classification.classification) {
          analysis = classification.classification;
          if (analysis.confidence >= 0.5) {
            documentType = mapDetectedTypeToStorageType(analysis.detectedType);
          }
        }

        // Filename-based fallback for large files or when classification fails
        const tailFromFilename = extractTailFromFilename(filename);
        const categoryFromFilename = extractCategoryFromFilename(filename);

        if (documentType === 'other' && (tailFromFilename || categoryFromFilename)) {
          // Treat as maintenance document if filename suggests aircraft logbook
          documentType = 'maintenance';
          progress(20, `Filename suggests maintenance log for ${tailFromFilename || 'aircraft'}`);
        }

        progress(25, `Detected: ${documentType}`);

        // Save file to disk if large
        const isLargeFile = fileBase64.length > MONGODB_SAFE_SIZE;
        let storedFile: any = null;

        if (isLargeFile) {
          progress(30, 'Saving file...');
          storedFile = await saveFile(
            fileBase64,
            filename || `doc_${Date.now()}.${fileType === 'pdf' ? 'pdf' : 'png'}`,
            fileType,
            'other'
          );
        }

        progress(35, 'Looking for matches...');

        // Look for existing pilot/aircraft or create new ones
        let pilotId: string | undefined;
        let aircraftId: string | undefined;
        const created = { pilot: false, aircraft: false };

        const pilotTypes = isPilotDocument(analysis?.detectedType || 'other');
        const aircraftTypes = isAircraftDocument(analysis?.detectedType || 'other');

        // Try to match or create pilot
        if (pilotTypes && analysis?.pilotName) {
          progress(40, 'Matching pilot...');
          const pilots = await Pilot.find({}).select('_id name email').lean();
          const normalizedSearch = analysis.pilotName.toLowerCase().trim();

          let matchedPilot = pilots.find((p: any) =>
            (p.name || '').toLowerCase().includes(normalizedSearch) ||
            normalizedSearch.includes((p.name || '').toLowerCase())
          );

          if (matchedPilot) {
            pilotId = matchedPilot._id.toString();
            progress(45, `Linked to pilot: ${matchedPilot.name}`);
          } else {
            // Create new pilot
            progress(45, `Creating new pilot: ${analysis.pilotName}`);
            const newPilot = await Pilot.create({
              name: analysis.pilotName,
              email: `${analysis.pilotName.toLowerCase().replace(/\s+/g, '.')}@placeholder.com`,
              certificates: {
                type: 'PPL',
                instrumentRated: false,
                multiEngineRated: false,
              },
              endorsements: [],
              experience: {
                totalHours: 0,
                picHours: 0,
                nightHours: 0,
                ifrHours: 0,
                crossCountryHours: 0,
                last90DaysHours: 0,
                last30DaysHours: 0,
              },
              medicalExpiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
              flightReviewExpiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            });
            pilotId = newPilot._id.toString();
            created.pilot = true;
            invalidateAllCaches();
          }
        }

        // Try to match or create aircraft
        // IMPORTANT: Only link aircraft to aircraft documents, NOT pilot logbooks
        // Pilot logbooks reference many aircraft but belong to the pilot
        let tailNumbers = analysis?.aircraftTailNumbers || [];

        // Fallback: extract tail number from filename if AI didn't find any
        if (tailNumbers.length === 0 && tailFromFilename) {
          tailNumbers = [tailFromFilename];
        }

        // For maintenance docs (including filename-detected ones), try to match aircraft
        const shouldMatchAircraft = aircraftTypes || documentType === 'maintenance';
        if (shouldMatchAircraft && tailNumbers.length > 0) {
          progress(50, 'Matching aircraft...');
          const allAircraft = await Aircraft.find({}).select('_id tailNumber').lean();

          for (const tail of tailNumbers) {
            const normalizedTail = tail.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const matchedAircraft = allAircraft.find((a: any) => {
              const acTail = (a.tailNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
              return acTail === normalizedTail || acTail.includes(normalizedTail) || normalizedTail.includes(acTail);
            });

            if (matchedAircraft) {
              aircraftId = matchedAircraft._id.toString();
              progress(55, `Linked to aircraft: ${matchedAircraft.tailNumber}`);
              break;
            }
          }

          // Create new aircraft if not found and this is an aircraft document
          if (!aircraftId && tailNumbers[0]) {
            progress(55, `Creating new aircraft: ${tailNumbers[0]}`);
            const newAircraft = await Aircraft.create({
              tailNumber: tailNumbers[0].toUpperCase(),
              model: analysis?.aircraftType || 'Unknown',
              serial: 'Unknown',
              manufacturer: 'Unknown',
              year: new Date().getFullYear(),
              maintenanceDates: {
                annual: new Date(),
                transponder: new Date(),
                staticSystem: new Date(),
              },
              currentHours: {
                hobbs: 0,
                tach: 0,
              },
              logs: [],
            });
            aircraftId = newAircraft._id.toString();
            created.aircraft = true;
            invalidateAllCaches();
          }
        }

        progress(60, 'Creating document record...');

        // Create document
        const doc = await ParsedDocument.create({
          filename: filename || `document_${Date.now()}.${fileType === 'pdf' ? 'pdf' : 'png'}`,
          originalFilename: filename,
          documentType,
          fileType,
          status: 'parsing',
          progress: 60,
          progressStep: 'processing',
          retryCount: 0,
          aircraft: aircraftId,
          pilot: pilotId,
          analysis,
          filePath: storedFile?.relativePath,
          fileSize: storedFile?.size || fileSizeBytes,
          fileBase64: (!storedFile && !isLargeFile) ? fileBase64 : undefined,
        });

        // Link document to pilot/aircraft
        if (pilotId) {
          await Pilot.findByIdAndUpdate(pilotId, { $addToSet: { linkedDocuments: doc._id } });
        }
        if (aircraftId) {
          await Aircraft.findByIdAndUpdate(aircraftId, { $addToSet: { linkedDocuments: doc._id } });
        }

        progress(65, 'Extracting data from document...');

        // Parse the document
        try {
          const parseType = documentType === 'poh' ? 'logbook' : documentType;
          const result = await parseDocumentUltraFast(
            fileBase64,
            fileType,
            parseType,
            (log) => {
              const mappedProgress = 65 + Math.round((log.progress / 100) * 25);
              progress(mappedProgress, log.message);
            }
          );

          if (!result.success) {
            await ParsedDocument.findByIdAndUpdate(doc._id, {
              status: 'failed',
              error: result.error,
            });
            send({ type: 'error', message: result.error });
            safeClose();
            return;
          }

          const entries = result.data?.extractedData?.entries ||
            (Array.isArray(result.data?.extractedData) ? result.data?.extractedData : []);

          const summary = calculateSummary(entries);

          // Update document with parsed data
          await ParsedDocument.findByIdAndUpdate(doc._id, {
            status: 'completed',
            progress: 100,
            progressStep: 'complete',
            parsedAt: new Date(),
            rawOutput: result.data?.extractedData,
            entries,
            summary,
          });

          progress(92, 'Updating linked records...');

          // Update pilot experience from logbook
          if (pilotId && ['pilot_logbook', 'logbook'].includes(documentType) && entries.length > 0) {
            await updatePilotExperience(pilotId, entries);
          }

          // Update aircraft from maintenance docs
          if (aircraftId && ['aircraft_logbook', 'maintenance', 'inspection'].includes(documentType) && entries.length > 0) {
            console.log(`[Smart-Upload] Updating aircraft ${aircraftId} with ${entries.length} entries (docType: ${documentType})`);
            await updateAircraftFromEntries(aircraftId, entries, categoryFromFilename || undefined);
          } else {
            console.log(`[Smart-Upload] Skipping aircraft update: aircraftId=${aircraftId}, docType=${documentType}, entries=${entries.length}`);
          }

          // Run audit if we have both pilot and aircraft
          let auditStatus: string | undefined;
          if (pilotId && aircraftId) {
            progress(95, 'Running safety audit...');
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

          send({
            type: 'complete',
            message: `Processed ${entries.length} entries`,
            documentId: doc._id.toString(),
            documentType,
            entryCount: entries.length,
            totalHours: summary.totalHours,
            created,
            auditStatus,
            linkedPilot: pilotId,
            linkedAircraft: aircraftId,
          });

        } catch (parseError) {
          console.error('Parse error:', parseError);
          await ParsedDocument.findByIdAndUpdate(doc._id, {
            status: 'failed',
            error: (parseError as Error).message,
          });
          send({ type: 'error', message: (parseError as Error).message });
        }

      } catch (error) {
        console.error('Smart upload error:', error);
        send({ type: 'error', message: (error as Error).message });
      } finally {
        safeClose();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
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
  filenameCategory?: LogbookCategory
) {
  console.log(`[updateAircraftFromEntries] Starting update for aircraft ${aircraftId} with ${entries.length} entries`);
  const aircraft = await Aircraft.findById(aircraftId);
  if (!aircraft) {
    console.log(`[updateAircraftFromEntries] Aircraft ${aircraftId} not found!`);
    return;
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
      // Check structured fields first (from parser)
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

  // Log detected maintenance dates
  console.log(`[Maintenance] Detected dates for ${aircraft.tailNumber}:`, {
    annual: latestAnnual,
    transponder: latestTransponder,
    static: latestStatic,
    hundredHour: latestHundredHour,
    elt: latestElt,
    maxHobbs,
    maxTach,
  });

  // Update maintenance dates
  if (latestAnnual) aircraft.maintenanceDates.annual = latestAnnual;
  if (latestTransponder) aircraft.maintenanceDates.transponder = latestTransponder;
  if (latestStatic) aircraft.maintenanceDates.staticSystem = latestStatic;
  if (latestHundredHour) aircraft.maintenanceDates.hundredHour = latestHundredHour;

  // Also update airworthinessStatus if it exists
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
    // Add to general logs (backward compatibility)
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

    console.log(`[Maintenance] Saved ${newLogs.length} entries to aircraft ${aircraft.tailNumber} (${filenameCategory || 'auto-categorized'})`);
  }

  // Save the updated aircraft
  try {
    // Generate safety analysis from maintenance entries
    const safetyAnalysis = generateSafetyAnalysis(entries, aircraft);
    aircraft.safetyAnalysis = safetyAnalysis;

    await aircraft.save();
    console.log(`[updateAircraftFromEntries] Successfully saved aircraft ${aircraft.tailNumber}`);
    console.log(`[updateAircraftFromEntries] Final dates:`, {
      annual: aircraft.maintenanceDates.annual,
      transponder: aircraft.maintenanceDates.transponder,
      staticSystem: aircraft.maintenanceDates.staticSystem,
      hundredHour: aircraft.maintenanceDates.hundredHour,
      hobbs: aircraft.currentHours.hobbs,
      tach: aircraft.currentHours.tach,
    });
    console.log(`[SafetyAnalysis] Generated for ${aircraft.tailNumber}: score=${safetyAnalysis.score}, findings=${safetyAnalysis.findings.length}`);
  } catch (saveError) {
    console.error(`[updateAircraftFromEntries] Error saving aircraft ${aircraft.tailNumber}:`, saveError);
    throw saveError;
  }
}

/**
 * Generate safety analysis from maintenance entries
 * Analyzes patterns, identifies concerning components, and calculates a safety score
 */
function generateSafetyAnalysis(entries: any[], aircraft: any) {
  const findings: Array<{
    component: string;
    status: 'ok' | 'warning' | 'critical';
    message: string;
    lastMentioned?: Date;
  }> = [];

  // Keywords to watch for (component -> severity keywords)
  const componentKeywords: Record<string, { critical: string[]; warning: string[] }> = {
    'Engine': {
      critical: ['engine failure', 'cylinder crack', 'cam shaft', 'crankshaft', 'engine replacement'],
      warning: ['cylinder compression', 'oil leak', 'exhaust leak', 'rough running', 'engine mount'],
    },
    'Magnetos': {
      critical: ['magneto failure', 'no spark'],
      warning: ['magneto check', 'magneto timing', 'impulse coupling', 'points', '500 hour'],
    },
    'Alternator': {
      critical: ['alternator failure', 'no charging'],
      warning: ['alternator belt', 'voltage regulator', 'low voltage', 'alternator replaced'],
    },
    'Vacuum System': {
      critical: ['vacuum pump failure', 'no suction'],
      warning: ['vacuum pump', 'gyro', 'attitude indicator', 'directional gyro'],
    },
    'Propeller': {
      critical: ['propeller strike', 'blade crack', 'prop failure'],
      warning: ['prop balance', 'blade nick', 'prop overhaul', 'governor'],
    },
    'Fuel System': {
      critical: ['fuel leak', 'fuel contamination'],
      warning: ['fuel pump', 'fuel filter', 'fuel selector', 'carburetor'],
    },
    'Landing Gear': {
      critical: ['gear collapse', 'gear failure'],
      warning: ['brake', 'tire', 'wheel bearing', 'strut', 'shimmy'],
    },
    'Airframe': {
      critical: ['corrosion found', 'crack found', 'structural damage'],
      warning: ['skin repair', 'rivet', 'hinge', 'control surface'],
    },
  };

  // Track mentions per component
  const componentMentions: Record<string, { count: number; lastDate?: Date; issues: string[] }> = {};

  // Analyze each entry
  for (const entry of entries) {
    const desc = (entry.description || '').toLowerCase();
    const entryDate = entry.date ? new Date(entry.date) : null;

    for (const [component, keywords] of Object.entries(componentKeywords)) {
      // Check critical keywords
      for (const kw of keywords.critical) {
        if (desc.includes(kw)) {
          if (!componentMentions[component]) {
            componentMentions[component] = { count: 0, issues: [] };
          }
          componentMentions[component].count++;
          componentMentions[component].issues.push(kw);
          if (entryDate && (!componentMentions[component].lastDate || entryDate > componentMentions[component].lastDate)) {
            componentMentions[component].lastDate = entryDate;
          }
        }
      }
      // Check warning keywords
      for (const kw of keywords.warning) {
        if (desc.includes(kw)) {
          if (!componentMentions[component]) {
            componentMentions[component] = { count: 0, issues: [] };
          }
          componentMentions[component].count++;
          if (!componentMentions[component].issues.includes(kw)) {
            componentMentions[component].issues.push(kw);
          }
          if (entryDate && (!componentMentions[component].lastDate || entryDate > componentMentions[component].lastDate)) {
            componentMentions[component].lastDate = entryDate;
          }
        }
      }
    }
  }

  // Generate findings based on component mentions
  let totalDeductions = 0;

  for (const [component, data] of Object.entries(componentMentions)) {
    const keywords = componentKeywords[component];

    // Check for critical issues
    const hasCritical = data.issues.some(issue =>
      keywords.critical.some(kw => issue.includes(kw))
    );

    if (hasCritical) {
      findings.push({
        component,
        status: 'critical',
        message: `Critical issue found: ${data.issues.slice(0, 2).join(', ')}`,
        lastMentioned: data.lastDate,
      });
      totalDeductions += 20;
    } else if (data.count >= 3) {
      // Multiple mentions = warning
      findings.push({
        component,
        status: 'warning',
        message: `Recurring maintenance: ${data.issues.slice(0, 3).join(', ')} (${data.count} mentions)`,
        lastMentioned: data.lastDate,
      });
      totalDeductions += 10;
    } else if (data.count >= 1) {
      findings.push({
        component,
        status: 'ok',
        message: `Recent service: ${data.issues.slice(0, 2).join(', ')}`,
        lastMentioned: data.lastDate,
      });
    }
  }

  // Check maintenance currency
  const now = new Date();
  const annualDate = aircraft.maintenanceDates?.annual ? new Date(aircraft.maintenanceDates.annual) : null;
  const transponderDate = aircraft.maintenanceDates?.transponder ? new Date(aircraft.maintenanceDates.transponder) : null;

  if (annualDate) {
    const monthsSinceAnnual = (now.getTime() - annualDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsSinceAnnual > 12) {
      findings.push({
        component: 'Annual Inspection',
        status: 'critical',
        message: `Annual expired ${Math.floor(monthsSinceAnnual - 12)} months ago`,
        lastMentioned: annualDate,
      });
      totalDeductions += 30;
    } else if (monthsSinceAnnual > 10) {
      findings.push({
        component: 'Annual Inspection',
        status: 'warning',
        message: `Annual due in ${Math.floor(12 - monthsSinceAnnual)} months`,
        lastMentioned: annualDate,
      });
      totalDeductions += 5;
    } else {
      findings.push({
        component: 'Annual Inspection',
        status: 'ok',
        message: `Annual current (${annualDate.toLocaleDateString()})`,
        lastMentioned: annualDate,
      });
    }
  }

  if (transponderDate) {
    const monthsSinceTransponder = (now.getTime() - transponderDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsSinceTransponder > 24) {
      findings.push({
        component: 'Transponder Check',
        status: 'critical',
        message: `Transponder check expired ${Math.floor(monthsSinceTransponder - 24)} months ago`,
        lastMentioned: transponderDate,
      });
      totalDeductions += 20;
    } else if (monthsSinceTransponder > 22) {
      findings.push({
        component: 'Transponder Check',
        status: 'warning',
        message: `Transponder check due in ${Math.floor(24 - monthsSinceTransponder)} months`,
        lastMentioned: transponderDate,
      });
      totalDeductions += 5;
    }
  }

  // Calculate final score (100 - deductions, min 0)
  const score = Math.max(0, Math.min(100, 100 - totalDeductions));

  // Sort findings: critical first, then warning, then ok
  findings.sort((a, b) => {
    const order = { critical: 0, warning: 1, ok: 2 };
    return order[a.status] - order[b.status];
  });

  return {
    lastAnalyzed: new Date(),
    score,
    findings: findings.slice(0, 10), // Limit to top 10 findings
  };
}
