import { NextRequest } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Aircraft from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';
import { parseDocumentUltraFast, StepLog } from '@/lib/services/reductoService';
import { classifyDocumentFast } from '@/lib/services/aiService';
import { saveFile } from '@/lib/services/fileStorage';
import { suggestAttachments, mapDetectedTypeToStorageType } from '@/lib/services/autoAttachService';
import { calculateSummary } from '@/lib/services/documentProcessingUtils';

export const maxDuration = 300;

const MONGODB_SAFE_SIZE = 10 * 1024 * 1024;

function formatSSE(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        controller.enqueue(encoder.encode(formatSSE(event, data)));
      };

      const sendLog = (log: StepLog) => {
        sendEvent('log', {
          step: log.step,
          message: log.message,
          progress: log.progress,
          timestamp: log.timestamp.toISOString(),
          duration: log.duration,
          details: log.details
        });
      };

      try {
        sendLog({
          step: 'initializing',
          message: 'Receiving upload request...',
          timestamp: new Date(),
          progress: 1,
          duration: 0
        });

        let body;
        try {
          const rawBody = await request.text();
          body = JSON.parse(rawBody);
        } catch {
          sendEvent('error', { message: 'Failed to parse request.' });
          controller.close();
          return;
        }

        const { fileBase64, fileType, documentType: requestedDocType, aircraftId, pilotId, filename } = body;

        if (!fileBase64 || !fileType) {
          sendEvent('error', { message: 'Missing required fields: fileBase64, fileType' });
          controller.close();
          return;
        }

        const fileSizeBytes = Math.ceil((fileBase64.length * 3) / 4);
        if (fileSizeBytes > 50 * 1024 * 1024) {
          sendEvent('error', { message: 'File too large. Maximum size is 50MB.' });
          controller.close();
          return;
        }

        sendLog({
          step: 'validating',
          message: `Validating file (${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB)...`,
          timestamp: new Date(),
          progress: 5,
          duration: 0
        });

        await dbConnect();

        sendLog({
          step: 'initializing',
          message: 'Database connected',
          timestamp: new Date(),
          progress: 10,
          duration: 0
        });

        const originalFilename = filename || `document_${Date.now()}.${fileType === 'pdf' ? 'pdf' : 'png'}`;
        const isLargeFile = fileBase64.length > MONGODB_SAFE_SIZE;

        // Classify document
        let analysis: any = null;
        let documentType = requestedDocType || 'other';
        let suggestedName = originalFilename;
        let autoAttachPilotId = pilotId;
        let autoAttachAircraftId = aircraftId;
        let storedFile: any = null;

        sendLog({
          step: 'analyzing',
          message: 'Analyzing document with AI...',
          timestamp: new Date(),
          progress: 15,
          duration: 0
        });

        try {
          const classifyStart = Date.now();
          const classificationResult = await classifyDocumentFast(fileBase64, fileType);
          const classifyDuration = Date.now() - classifyStart;

          if (classificationResult.success && classificationResult.classification) {
            analysis = classificationResult.classification;
            const confidenceThreshold = 0.5;

            if (analysis.confidence >= confidenceThreshold && analysis.detectedType !== 'unknown') {
              documentType = mapDetectedTypeToStorageType(analysis.detectedType);
              sendLog({
                step: 'classifying',
                message: `Classified as: ${documentType} (${Math.round(analysis.confidence * 100)}%)`,
                timestamp: new Date(),
                progress: 25,
                duration: classifyDuration
              });

              // Try to auto-attach
              try {
                const attachSuggestions = await suggestAttachments(analysis);
                if (attachSuggestions.attachmentConfidence >= 0.7) {
                  if (attachSuggestions.suggestedPilotId) {
                    autoAttachPilotId = attachSuggestions.suggestedPilotId;
                  }
                  if (attachSuggestions.suggestedAircraftId) {
                    autoAttachAircraftId = attachSuggestions.suggestedAircraftId;
                  }
                  sendLog({
                    step: 'classifying',
                    message: `Auto-linked: ${attachSuggestions.attachmentReason}`,
                    timestamp: new Date(),
                    progress: 30,
                    duration: 0
                  });
                }
              } catch (attachError) {
                console.error('Auto-attachment error:', attachError);
              }
            }

            if (analysis.suggestedName) {
              suggestedName = analysis.suggestedName;
            }
          }
        } catch (classifyError) {
          console.error('Classification error:', classifyError);
        }

        // Save large files to disk
        if (isLargeFile) {
          sendLog({
            step: 'uploading',
            message: 'Saving file to disk...',
            timestamp: new Date(),
            progress: 35,
            duration: 0
          });
          storedFile = await saveFile(
            fileBase64,
            originalFilename,
            fileType,
            'other'
          );
        }

        sendLog({
          step: 'initializing',
          message: 'Creating document record...',
          timestamp: new Date(),
          progress: 40,
          duration: 0
        });

        // Create document record
        const doc = await ParsedDocument.create({
          filename: suggestedName,
          originalFilename,
          documentType,
          fileType,
          status: 'parsing',
          progress: 40,
          progressStep: 'processing',
          retryCount: 0,
          aircraft: autoAttachAircraftId || undefined,
          pilot: autoAttachPilotId || undefined,
          analysis: analysis || undefined,
          filePath: storedFile?.relativePath,
          fileSize: storedFile?.size || fileSizeBytes,
          fileBase64: (!storedFile && !isLargeFile) ? fileBase64 : undefined,
        });

        // Update linked documents
        if (autoAttachPilotId && autoAttachPilotId !== pilotId) {
          await Pilot.findByIdAndUpdate(autoAttachPilotId, { $addToSet: { linkedDocuments: doc._id } });
        }
        if (autoAttachAircraftId && autoAttachAircraftId !== aircraftId) {
          await Aircraft.findByIdAndUpdate(autoAttachAircraftId, { $addToSet: { linkedDocuments: doc._id } });
        }

        // Parse document
        sendLog({
          step: 'extracting',
          message: 'Extracting data from document...',
          timestamp: new Date(),
          progress: 45,
          duration: 0
        });

        try {
          const parseType = documentType === 'poh' ? 'logbook' : documentType;
          const result = await parseDocumentUltraFast(
            fileBase64,
            fileType,
            parseType,
            (log) => {
              const mappedProgress = 45 + Math.round((log.progress / 100) * 45);
              sendLog({ ...log, progress: mappedProgress });
            }
          );

          if (!result.success) {
            await ParsedDocument.findByIdAndUpdate(doc._id, {
              status: 'failed',
              error: result.error,
            });
            sendEvent('error', { message: result.error, documentId: doc._id.toString() });
            controller.close();
            return;
          }

          const entries = result.data?.extractedData?.entries ||
            (Array.isArray(result.data?.extractedData) ? result.data?.extractedData : []);

          const summary = calculateSummary(entries);

          await ParsedDocument.findByIdAndUpdate(doc._id, {
            status: 'completed',
            progress: 100,
            progressStep: 'complete',
            parsedAt: new Date(),
            rawOutput: result.data?.extractedData,
            entries,
            summary,
          });

          // Update pilot experience if applicable
          if (autoAttachPilotId && ['pilot_logbook', 'logbook'].includes(documentType)) {
            await updatePilotFromEntries(autoAttachPilotId, entries);
          }

          // Update aircraft if applicable
          if (autoAttachAircraftId && ['aircraft_logbook', 'maintenance', 'inspection'].includes(documentType)) {
            await updateAircraftFromEntries(autoAttachAircraftId, entries);
          }

          sendLog({
            step: 'complete',
            message: 'Processing complete!',
            timestamp: new Date(),
            progress: 100,
            duration: 0
          });

          sendEvent('complete', {
            documentId: doc._id.toString(),
            filename: suggestedName,
            documentType,
            status: 'completed',
            entryCount: entries.length,
            summary,
            analysis: analysis || undefined,
          });

        } catch (parseError) {
          console.error('Parse error:', parseError);
          await ParsedDocument.findByIdAndUpdate(doc._id, {
            status: 'failed',
            error: (parseError as Error).message,
          });
          sendEvent('error', { message: (parseError as Error).message, documentId: doc._id.toString() });
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

async function updatePilotFromEntries(pilotId: string, entries: any[]) {
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
    totalTime: e.totalTime || e.duration || 0,
    pic: e.pic || 0,
    night: e.night || 0,
    actualInstrument: e.actualInstrument || 0,
    crossCountry: e.crossCountry || 0,
    landingsDay: e.landingsDay || 0,
    landingsNight: e.landingsNight || 0,
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
    ifrHours += entry.actualInstrument || 0;
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

  let maxHobbs = aircraft.currentHours.hobbs;
  let maxTach = aircraft.currentHours.tach;

  for (const entry of entries) {
    if (entry.hobbsTime && entry.hobbsTime > maxHobbs) maxHobbs = entry.hobbsTime;
    if (entry.tachTime && entry.tachTime > maxTach) maxTach = entry.tachTime;
  }

  if (maxHobbs > aircraft.currentHours.hobbs) aircraft.currentHours.hobbs = maxHobbs;
  if (maxTach > aircraft.currentHours.tach) aircraft.currentHours.tach = maxTach;

  const newLogs = entries.map((entry: any) => ({
    date: entry.date ? new Date(entry.date) : new Date(),
    description: entry.description || entry.workPerformed || 'Entry',
    hobbsTime: entry.hobbsTime || aircraft.currentHours.hobbs,
    tachTime: entry.tachTime || aircraft.currentHours.tach,
    mechanic: entry.mechanic || entry.signedBy,
  })).filter(log => log.description !== 'Entry');

  if (newLogs.length > 0) {
    aircraft.logs.push(...newLogs);
  }

  await aircraft.save();
}
