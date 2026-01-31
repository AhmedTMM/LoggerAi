import { NextRequest } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Aircraft from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';
import { parseDocument, StepLog } from '@/lib/services/reductoService';
import { saveFile } from '@/lib/services/fileStorage';

// Allow longer timeout for large file processing
export const maxDuration = 300;

// MongoDB has a 16MB document limit. Base64 adds ~33% overhead.
const MONGODB_SAFE_SIZE = 10 * 1024 * 1024; // 10MB base64

// SSE helper to format messages
function formatSSE(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Fast filename-based document type detection (instant, no API call)
function detectDocumentTypeFromFilename(filename: string): {
  type: 'logbook' | 'maintenance' | 'poh' | 'other';
  confidence: number;
  reason: string;
} {
  const lower = filename.toLowerCase();

  // Maintenance log patterns (airframe, engine, propeller logs)
  if (lower.includes('airframe') || lower.includes('engine-log') || lower.includes('prop-log') ||
      lower.includes('maintenance') || lower.includes('mx-log') || lower.includes('aircraft-log') ||
      lower.includes('maint') || lower.includes('annual') || lower.includes('100-hour') ||
      lower.includes('100hr') || lower.includes('squawk') || lower.includes('discrepancy')) {
    return { type: 'maintenance', confidence: 0.95, reason: 'Filename indicates maintenance record' };
  }

  // Pilot logbook patterns
  if (lower.includes('logbook') || lower.includes('pilot-log') || lower.includes('flight-log') ||
      lower.includes('flying-log') || lower.includes('pilot_log') || lower.includes('flight_log') ||
      lower.includes('flightlog') || lower.includes('pilotlog')) {
    return { type: 'logbook', confidence: 0.95, reason: 'Filename indicates pilot logbook' };
  }

  // POH patterns
  if (lower.includes('poh') || lower.includes('pilot-operating') || lower.includes('operating-handbook') ||
      lower.includes('afm') || lower.includes('aircraft-flight-manual') || lower.includes('checklist')) {
    return { type: 'poh', confidence: 0.90, reason: 'Filename indicates POH/AFM' };
  }

  // N-number at start often indicates aircraft-related document (likely maintenance)
  if (/^n\d{1,5}[a-z]{0,2}[-_\s]/i.test(filename)) {
    return { type: 'maintenance', confidence: 0.80, reason: 'Filename starts with N-number (aircraft document)' };
  }

  // Default - but still try to parse as maintenance since that's most common for aircraft docs
  return { type: 'maintenance', confidence: 0.60, reason: 'Default - will attempt maintenance extraction' };
}

// Streaming upload endpoint with Server-Sent Events for real-time progress
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const startTime = Date.now();

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(encoder.encode(formatSSE(event, data)));
      };

      const sendLog = (log: Partial<StepLog> & { step: string; message: string; progress: number }) => {
        sendEvent('log', {
          step: log.step,
          message: log.message,
          progress: log.progress,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
          details: log.details
        });
      };

      try {
        // Parse request body
        sendLog({
          step: 'initializing',
          message: 'Receiving upload...',
          progress: 2
        });

        let body;
        try {
          const rawBody = await request.text();
          body = JSON.parse(rawBody);
        } catch (parseError) {
          sendEvent('error', { message: 'Failed to parse request. File may be too large (max 50MB).' });
          controller.close();
          return;
        }

        const { fileBase64, fileType, documentType: requestedDocType, aircraftId, pilotId, filename } = body;

        if (!fileBase64 || !fileType) {
          sendEvent('error', { message: 'Missing required fields: fileBase64, fileType' });
          controller.close();
          return;
        }

        // Validate file size
        const fileSizeBytes = Math.ceil((fileBase64.length * 3) / 4);
        const maxSizeBytes = 50 * 1024 * 1024;
        const fileSizeMB = (fileSizeBytes / 1024 / 1024).toFixed(1);

        sendLog({
          step: 'validating',
          message: `File validated: ${fileSizeMB} MB`,
          progress: 5,
          details: { sizeBytes: fileSizeBytes, sizeMB: fileSizeMB }
        });

        if (fileSizeBytes > maxSizeBytes) {
          sendEvent('error', { message: `File too large. Maximum size is 50MB.` });
          controller.close();
          return;
        }

        const originalFilename = filename || `document_${Date.now()}.${fileType === 'pdf' ? 'pdf' : 'png'}`;

        // FAST: Detect document type from filename (instant - no API call!)
        const detection = detectDocumentTypeFromFilename(originalFilename);
        let documentType = requestedDocType !== 'other' ? requestedDocType : detection.type;

        sendLog({
          step: 'classifying',
          message: `Type detected: ${documentType} (${Math.round(detection.confidence * 100)}%)`,
          progress: 8,
          details: {
            detectedType: documentType,
            confidence: detection.confidence,
            reason: detection.reason
          }
        });

        // Connect to database
        sendLog({
          step: 'initializing',
          message: 'Connecting to database...',
          progress: 10
        });

        await dbConnect();

        // Save file to disk
        sendLog({
          step: 'uploading',
          message: 'Saving file to storage...',
          progress: 12
        });

        let storedFile = null;
        try {
          storedFile = await saveFile(fileBase64, originalFilename, fileType, documentType as any);
          sendLog({
            step: 'uploading',
            message: 'File saved successfully',
            progress: 15,
            details: { path: storedFile?.relativePath }
          });
        } catch (saveError) {
          sendLog({
            step: 'uploading',
            message: 'Using memory storage (disk save failed)',
            progress: 15
          });
        }

        // Create document record
        const doc = await ParsedDocument.create({
          filename: originalFilename,
          originalFilename,
          documentType,
          fileType,
          status: 'parsing',
          progress: 15,
          progressStep: 'processing',
          retryCount: 0,
          aircraft: aircraftId || undefined,
          pilot: pilotId || undefined,
          analysis: {
            detectedType: documentType,
            confidence: detection.confidence,
            suggestedName: originalFilename,
            documentQuality: 'good',
            qualityNotes: [detection.reason],
            isHandwritten: false,
            summary: `${documentType} document`
          },
          filePath: storedFile?.relativePath,
          fileSize: storedFile?.size || fileSizeBytes,
        });

        sendLog({
          step: 'initializing',
          message: `Document created (${doc._id.toString().slice(-6)})`,
          progress: 18,
          details: { documentId: doc._id.toString() }
        });

        // Start Reducto extraction
        sendLog({
          step: 'extracting',
          message: 'Starting AI extraction with Reducto...',
          progress: 20
        });

        try {
          // Parse with step logging - this is the main processing
          const result = await parseDocument(
            fileBase64,
            fileType,
            documentType === 'poh' ? 'maintenance' : (documentType as 'logbook' | 'maintenance'),
            (log) => {
              // Remap progress: 20-90 for extraction
              const mappedProgress = 20 + Math.round((log.progress / 100) * 70);
              sendLog({
                step: log.step,
                message: log.message,
                progress: mappedProgress,
                details: log.details
              });
            }
          );

          if (!result.success) {
            await ParsedDocument.findByIdAndUpdate(doc._id, {
              status: 'failed',
              progress: 0,
              progressStep: 'failed',
              error: result.error,
            });
            sendEvent('error', { message: result.error, documentId: doc._id.toString() });
            controller.close();
            return;
          }

          // Extract entries from result
          const entries = result.data?.extractedData?.entries ||
            (Array.isArray(result.data?.extractedData) ? result.data?.extractedData : []);

          const summary = calculateSummary(entries);

          sendLog({
            step: 'structuring',
            message: `Extracted ${entries.length} entries`,
            progress: 92,
            details: {
              entryCount: entries.length,
              totalHours: summary.totalHours,
              dateRange: summary.dateRange
            }
          });

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

          // Update linked aircraft if maintenance type
          if (aircraftId && documentType === 'maintenance' && entries.length > 0) {
            sendLog({
              step: 'structuring',
              message: 'Updating aircraft records...',
              progress: 95
            });
            await updateAircraftFromParsedData(aircraftId, entries, result.data?.extractedData);
          }

          // Update linked pilot if logbook type
          if (pilotId && documentType === 'logbook') {
            sendLog({
              step: 'structuring',
              message: 'Updating pilot records...',
              progress: 97
            });
            await updatePilotFromParsedData(pilotId, entries);
          }

          const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

          sendLog({
            step: 'complete',
            message: `Done! ${entries.length} entries in ${totalTime}s`,
            progress: 100,
            details: {
              documentId: doc._id.toString(),
              documentType,
              entryCount: entries.length,
              totalHours: summary.totalHours,
              processingTime: totalTime
            }
          });

          sendEvent('complete', {
            documentId: doc._id.toString(),
            filename: originalFilename,
            originalFilename,
            documentType,
            status: 'completed',
            progress: 100,
            progressStep: 'complete',
            message: 'Document parsed successfully.',
            summary,
            filePath: storedFile?.relativePath,
            entryCount: entries.length
          });

        } catch (parseError) {
          console.error('Parse error:', parseError);
          await ParsedDocument.findByIdAndUpdate(doc._id, {
            status: 'failed',
            progress: 0,
            progressStep: 'failed',
            error: (parseError as Error).message,
          });

          sendLog({
            step: 'error',
            message: `Failed: ${(parseError as Error).message}`,
            progress: 0,
            details: { error: (parseError as Error).message }
          });

          sendEvent('error', {
            message: (parseError as Error).message,
            documentId: doc._id.toString()
          });
        }

      } catch (error) {
        console.error('Upload stream error:', error);
        sendEvent('error', { message: (error as Error).message });
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
  const dates = entries
    .map(e => e.date)
    .filter(Boolean)
    .sort();

  return {
    totalEntries: entries.length,
    totalHours: Math.round(totalHours * 10) / 10,
    dateRange: dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : undefined,
  };
}

async function updateAircraftFromParsedData(
  aircraftId: string,
  entries: any[],
  extractedData: any
) {
  const aircraft = await Aircraft.findById(aircraftId);
  if (!aircraft) return;

  const newLogs = entries.map((entry: any) => {
    const log: any = {
      date: entry.date ? new Date(entry.date) : new Date(),
      description: entry.description || entry.workPerformed || 'Maintenance entry',
      mechanic: entry.mechanic || entry.signedBy,
    };

    if (entry.hobbsTime != null && !isNaN(entry.hobbsTime)) {
      log.hobbsTime = entry.hobbsTime;
    }
    if (entry.tachTime != null && !isNaN(entry.tachTime)) {
      log.tachTime = entry.tachTime;
    }
    if (entry.certificateNumber) {
      log.certificateNumber = entry.certificateNumber;
    }

    return log;
  }).filter(log => log.description && log.description !== 'Maintenance entry');

  if (newLogs.length > 0) {
    aircraft.logs.push(...newLogs);
  }

  let latestAnnual: Date | null = null;
  let latestTransponder: Date | null = null;
  let latestStatic: Date | null = null;
  let latestHundredHour: Date | null = null;
  let maxHobbs = aircraft.currentHours.hobbs;
  let maxTach = aircraft.currentHours.tach;

  for (const entry of entries) {
    const entryDate = entry.date ? new Date(entry.date) : null;

    if (entry.isInspection && entryDate) {
      if (entry.inspectionType === 'annual') {
        if (!latestAnnual || entryDate > latestAnnual) latestAnnual = entryDate;
      } else if (entry.inspectionType === '100hour') {
        if (!latestHundredHour || entryDate > latestHundredHour) latestHundredHour = entryDate;
      } else if (entry.inspectionType === 'transponder') {
        if (!latestTransponder || entryDate > latestTransponder) latestTransponder = entryDate;
      } else if (entry.inspectionType === 'static') {
        if (!latestStatic || entryDate > latestStatic) latestStatic = entryDate;
      }
    }

    const desc = (entry.description || '').toLowerCase();
    if (entryDate) {
      if (desc.includes('annual inspection') || desc.includes('annual insp')) {
        if (!latestAnnual || entryDate > latestAnnual) latestAnnual = entryDate;
      }
      if (desc.includes('100 hour') || desc.includes('100hr') || desc.includes('100-hour')) {
        if (!latestHundredHour || entryDate > latestHundredHour) latestHundredHour = entryDate;
      }
      if (desc.includes('transponder') && (desc.includes('91.413') || desc.includes('check'))) {
        if (!latestTransponder || entryDate > latestTransponder) latestTransponder = entryDate;
      }
      if (desc.includes('static') && desc.includes('91.411')) {
        if (!latestStatic || entryDate > latestStatic) latestStatic = entryDate;
      }
    }

    if (entry.hobbsTime && entry.hobbsTime > maxHobbs) maxHobbs = entry.hobbsTime;
    if (entry.tachTime && entry.tachTime > maxTach) maxTach = entry.tachTime;
  }

  if (latestAnnual) aircraft.maintenanceDates.annual = latestAnnual;
  if (latestTransponder) aircraft.maintenanceDates.transponder = latestTransponder;
  if (latestStatic) aircraft.maintenanceDates.staticSystem = latestStatic;
  if (latestHundredHour) aircraft.maintenanceDates.hundredHour = latestHundredHour;

  if (extractedData?.annualDate) {
    aircraft.maintenanceDates.annual = new Date(extractedData.annualDate);
  }
  if (extractedData?.transponderDate) {
    aircraft.maintenanceDates.transponder = new Date(extractedData.transponderDate);
  }
  if (extractedData?.staticSystemDate) {
    aircraft.maintenanceDates.staticSystem = new Date(extractedData.staticSystemDate);
  }

  if (maxHobbs > aircraft.currentHours.hobbs) {
    aircraft.currentHours.hobbs = maxHobbs;
  }
  if (maxTach > aircraft.currentHours.tach) {
    aircraft.currentHours.tach = maxTach;
  }

  await aircraft.save();
}

async function updatePilotFromParsedData(pilotId: string, entries: any[]) {
  const pilot = await Pilot.findById(pilotId);
  if (!pilot) return;

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
