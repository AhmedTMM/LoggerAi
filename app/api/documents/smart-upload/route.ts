import { NextRequest } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Aircraft from '@/lib/models/Aircraft';
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

function formatSSE(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(formatSSE(data)));
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
          controller.close();
          return;
        }

        const { fileBase64, fileType, filename } = body;
        if (!fileBase64 || !fileType) {
          send({ type: 'error', message: 'Missing fileBase64 or fileType' });
          controller.close();
          return;
        }

        const fileSizeBytes = Math.ceil((fileBase64.length * 3) / 4);
        if (fileSizeBytes > 50 * 1024 * 1024) {
          send({ type: 'error', message: 'File too large (max 50MB)' });
          controller.close();
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
        const tailNumbers = analysis?.aircraftTailNumbers || [];
        if ((aircraftTypes || tailNumbers.length > 0) && tailNumbers.length > 0) {
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
          if (!aircraftId && aircraftTypes && tailNumbers[0]) {
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
            controller.close();
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
            await updateAircraftFromEntries(aircraftId, entries);
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
        controller.close();
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

async function updateAircraftFromEntries(aircraftId: string, entries: any[]) {
  const aircraft = await Aircraft.findById(aircraftId);
  if (!aircraft) return;

  // Extract maintenance info
  let latestAnnual: Date | null = null;
  let latestTransponder: Date | null = null;
  let latestStatic: Date | null = null;
  let maxHobbs = aircraft.currentHours.hobbs;
  let maxTach = aircraft.currentHours.tach;

  for (const entry of entries) {
    const entryDate = entry.date ? new Date(entry.date) : null;
    const desc = (entry.description || '').toLowerCase();

    if (entryDate && !isNaN(entryDate.getTime())) {
      if (desc.includes('annual')) {
        if (!latestAnnual || entryDate > latestAnnual) latestAnnual = entryDate;
      }
      if (desc.includes('transponder')) {
        if (!latestTransponder || entryDate > latestTransponder) latestTransponder = entryDate;
      }
      if (desc.includes('static') || desc.includes('altimeter')) {
        if (!latestStatic || entryDate > latestStatic) latestStatic = entryDate;
      }
    }

    if (entry.hobbsTime && entry.hobbsTime > maxHobbs) maxHobbs = entry.hobbsTime;
    if (entry.tachTime && entry.tachTime > maxTach) maxTach = entry.tachTime;
  }

  if (latestAnnual) aircraft.maintenanceDates.annual = latestAnnual;
  if (latestTransponder) aircraft.maintenanceDates.transponder = latestTransponder;
  if (latestStatic) aircraft.maintenanceDates.staticSystem = latestStatic;

  if (maxHobbs > aircraft.currentHours.hobbs) aircraft.currentHours.hobbs = maxHobbs;
  if (maxTach > aircraft.currentHours.tach) aircraft.currentHours.tach = maxTach;

  // Add log entries
  const newLogs = entries.map((entry: any) => ({
    date: entry.date ? new Date(entry.date) : new Date(),
    description: entry.description || entry.workPerformed || 'Maintenance entry',
    hobbsTime: entry.hobbsTime || aircraft.currentHours.hobbs,
    tachTime: entry.tachTime || aircraft.currentHours.tach,
    mechanic: entry.mechanic || entry.signedBy,
  })).filter(log => log.description !== 'Maintenance entry');

  if (newLogs.length > 0) {
    aircraft.logs.push(...newLogs);
  }

  await aircraft.save();
}
