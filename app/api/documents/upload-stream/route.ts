import { NextRequest } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Aircraft from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';
import { parseDocumentUltraFast, StepLog } from '@/lib/services/reductoService';
import { classifyDocumentFast } from '@/lib/services/aiService';
import { saveFile } from '@/lib/services/fileStorage';
import { suggestAttachments, mapDetectedTypeToStorageType, isPilotDocument, isAircraftDocument } from '@/lib/services/autoAttachService';

// Allow longer timeout for large file processing
export const maxDuration = 300;

// MongoDB has a 16MB document limit. Base64 adds ~33% overhead.
const MONGODB_SAFE_SIZE = 10 * 1024 * 1024; // 10MB base64

// SSE helper to format messages
function formatSSE(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Streaming upload endpoint with Server-Sent Events for real-time progress
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  // Create a readable stream for SSE
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
        // Parse request body
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
        } catch (parseError) {
          sendEvent('error', { message: 'Failed to parse request. File may be too large (max 50MB).' });
          controller.close();
          return;
        }

        const { fileBase64, fileType, documentType: requestedDocType, aircraftId, pilotId, filename, skipAnalysis } = body;

        if (!fileBase64 || !fileType) {
          sendEvent('error', { message: 'Missing required fields: fileBase64, fileType' });
          controller.close();
          return;
        }

        // Validate file size
        const fileSizeBytes = Math.ceil((fileBase64.length * 3) / 4);
        const maxSizeBytes = 50 * 1024 * 1024;

        sendLog({
          step: 'validating',
          message: `Validating file (${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB)...`,
          timestamp: new Date(),
          progress: 3,
          duration: 0,
          details: { sizeBytes: fileSizeBytes, sizeMB: (fileSizeBytes / 1024 / 1024).toFixed(2) }
        });

        if (fileSizeBytes > maxSizeBytes) {
          sendEvent('error', { message: `File too large. Maximum size is 50MB. Your file is ${Math.round(fileSizeBytes / 1024 / 1024)}MB` });
          controller.close();
          return;
        }

        // Connect to database
        sendLog({
          step: 'initializing',
          message: 'Connecting to database...',
          timestamp: new Date(),
          progress: 5,
          duration: 0
        });

        await dbConnect();

        sendLog({
          step: 'initializing',
          message: 'Database connected',
          timestamp: new Date(),
          progress: 7,
          duration: 0
        });

        const originalFilename = filename || `document_${Date.now()}.${fileType === 'pdf' ? 'pdf' : 'png'}`;
        const isLargeFile = fileBase64.length > MONGODB_SAFE_SIZE;

        // Step 1: Analyze document to determine type and quality
        let analysis: any = null;
        let documentType = requestedDocType || 'other';
        let suggestedName = originalFilename;
        let autoAttachPilotId = pilotId;
        let autoAttachAircraftId = aircraftId;

        if (!skipAnalysis) {
          sendLog({
            step: 'analyzing',
            message: 'Starting fast AI classification (Gemini Flash)...',
            timestamp: new Date(),
            progress: 10,
            duration: 0
          });

          try {
            // Use fast Gemini Flash classification instead of slow Reducto analysis
            const classifyStart = Date.now();
            const classificationResult = await classifyDocumentFast(fileBase64, fileType);
            const classifyDuration = Date.now() - classifyStart;

            if (classificationResult.success && classificationResult.classification) {
              analysis = classificationResult.classification;
              // Use detected type if confidence is high enough
              if (analysis.confidence >= 0.7 && analysis.detectedType !== 'unknown') {
                // Map detected type to storage type
                documentType = mapDetectedTypeToStorageType(analysis.detectedType);
                sendLog({
                  step: 'classifying',
                  message: `Document classified as: ${documentType} (${Math.round(analysis.confidence * 100)}% confidence) in ${(classifyDuration / 1000).toFixed(1)}s`,
                  timestamp: new Date(),
                  progress: 30,
                  duration: classifyDuration,
                  details: {
                    detectedType: analysis.detectedType,
                    confidence: analysis.confidence,
                    quality: analysis.documentQuality,
                    isHandwritten: analysis.isHandwritten,
                    classificationTimeMs: classifyDuration
                  }
                });

                // Step 1b: Auto-suggest attachments based on classification
                if (!pilotId && !aircraftId) {
                  sendLog({
                    step: 'analyzing',
                    message: 'Matching document to existing pilots/aircraft...',
                    timestamp: new Date(),
                    progress: 32,
                    duration: 0
                  });

                  try {
                    const attachSuggestions = await suggestAttachments(analysis);

                    if (attachSuggestions.attachmentConfidence >= 0.7) {
                      // High confidence - auto-attach
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
                        progress: 35,
                        duration: 0,
                        details: {
                          pilot: attachSuggestions.suggestedPilotName,
                          aircraft: attachSuggestions.suggestedAircraftTail,
                          confidence: Math.round(attachSuggestions.attachmentConfidence * 100)
                        }
                      });

                      // Store suggestions in analysis for UI display
                      analysis.suggestedPilotId = attachSuggestions.suggestedPilotId;
                      analysis.suggestedAircraftId = attachSuggestions.suggestedAircraftId;
                      analysis.attachmentConfidence = attachSuggestions.attachmentConfidence;
                      analysis.attachmentReason = attachSuggestions.attachmentReason;
                    } else if (attachSuggestions.suggestedPilotId || attachSuggestions.suggestedAircraftId) {
                      // Low confidence - suggest but don't auto-attach
                      sendLog({
                        step: 'classifying',
                        message: `Suggested match (${Math.round(attachSuggestions.attachmentConfidence * 100)}% confidence): ${attachSuggestions.attachmentReason}`,
                        timestamp: new Date(),
                        progress: 35,
                        duration: 0,
                        details: {
                          pilot: attachSuggestions.suggestedPilotName,
                          aircraft: attachSuggestions.suggestedAircraftTail,
                          confidence: Math.round(attachSuggestions.attachmentConfidence * 100),
                          autoAttached: false
                        }
                      });

                      // Store suggestions for manual confirmation
                      analysis.suggestedPilotId = attachSuggestions.suggestedPilotId;
                      analysis.suggestedAircraftId = attachSuggestions.suggestedAircraftId;
                      analysis.attachmentConfidence = attachSuggestions.attachmentConfidence;
                      analysis.attachmentReason = attachSuggestions.attachmentReason;
                    }
                  } catch (attachError) {
                    console.error('Auto-attachment error:', attachError);
                    // Non-critical - continue without auto-attachment
                  }
                }
              } else {
                sendLog({
                  step: 'classifying',
                  message: `Classification complete in ${(classifyDuration / 1000).toFixed(1)}s (low confidence: ${Math.round(analysis.confidence * 100)}%)`,
                  timestamp: new Date(),
                  progress: 35,
                  duration: classifyDuration,
                  details: {
                    detectedType: analysis.detectedType,
                    confidence: analysis.confidence,
                    classificationTimeMs: classifyDuration
                  }
                });
              }
              if (analysis.suggestedName) {
                suggestedName = analysis.suggestedName;
              }
            }
          } catch (analysisError) {
            sendLog({
              step: 'analyzing',
              message: 'Fast classification skipped (non-critical error)',
              timestamp: new Date(),
              progress: 35,
              duration: 0,
              details: { error: (analysisError as Error).message }
            });
          }
        }

        // Step 2: Save file to disk
        sendLog({
          step: 'uploading',
          message: 'Saving file to storage...',
          timestamp: new Date(),
          progress: 38,
          duration: 0
        });

        let storedFile = null;
        try {
          storedFile = await saveFile(fileBase64, originalFilename, fileType, documentType as any);
          sendLog({
            step: 'uploading',
            message: 'File saved to disk successfully',
            timestamp: new Date(),
            progress: 42,
            duration: 0,
            details: { path: storedFile?.relativePath }
          });
        } catch (saveError) {
          sendLog({
            step: 'uploading',
            message: 'File storage failed, using memory fallback',
            timestamp: new Date(),
            progress: 42,
            duration: 0,
            details: { error: (saveError as Error).message }
          });
        }

        // Create document record
        sendLog({
          step: 'initializing',
          message: 'Creating document record...',
          timestamp: new Date(),
          progress: 44,
          duration: 0
        });

        const doc = await ParsedDocument.create({
          filename: suggestedName,
          originalFilename,
          documentType,
          fileType,
          status: isLargeFile ? 'parsing' : 'pending',
          progress: isLargeFile ? 10 : 0,
          progressStep: isLargeFile ? 'queued' : 'pending',
          retryCount: 0,
          aircraft: autoAttachAircraftId || undefined,
          pilot: autoAttachPilotId || undefined,
          analysis: analysis || undefined,
          filePath: storedFile?.relativePath,
          fileSize: storedFile?.size || fileSizeBytes,
          fileBase64: (!storedFile && !isLargeFile) ? fileBase64 : undefined,
        });

        // If auto-attached, also update the pilot/aircraft linkedDocuments
        if (autoAttachPilotId && autoAttachPilotId !== pilotId) {
          await Pilot.findByIdAndUpdate(
            autoAttachPilotId,
            { $addToSet: { linkedDocuments: doc._id } }
          );
        }
        if (autoAttachAircraftId && autoAttachAircraftId !== aircraftId) {
          await Aircraft.findByIdAndUpdate(
            autoAttachAircraftId,
            { $addToSet: { linkedDocuments: doc._id } }
          );
        }

        sendLog({
          step: 'initializing',
          message: `Document record created (ID: ${doc._id})`,
          timestamp: new Date(),
          progress: 46,
          duration: 0,
          details: { documentId: doc._id.toString() }
        });

        // For large files or when we have a doc type, parse immediately
        if (isLargeFile || documentType !== 'other') {
          sendLog({
            step: 'extracting',
            message: 'Starting Reducto AI extraction...',
            timestamp: new Date(),
            progress: 48,
            duration: 0
          });

          try {
            // Update status in DB
            await ParsedDocument.findByIdAndUpdate(doc._id, {
              status: 'parsing',
              progress: 50,
              progressStep: 'processing',
            });

            // Parse with step logging (using ultra-fast direct Gemini vision)
            const result = await parseDocumentUltraFast(
              fileBase64,
              fileType,
              documentType === 'poh' ? 'logbook' : (documentType as 'logbook' | 'maintenance'),
              (log) => {
                // Remap progress to 50-95 range
                const mappedProgress = 50 + Math.round((log.progress / 100) * 45);
                sendLog({
                  ...log,
                  progress: mappedProgress
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
              timestamp: new Date(),
              progress: 96,
              duration: 0,
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

            // Update linked aircraft if aircraft-related document
            const aircraftDocTypes = ['aircraft_logbook', 'maintenance', 'inspection', 'ad_compliance', 'service_bulletin'];
            if (autoAttachAircraftId && aircraftDocTypes.includes(documentType) && entries.length > 0) {
              sendLog({
                step: 'structuring',
                message: 'Updating linked aircraft records...',
                timestamp: new Date(),
                progress: 97,
                duration: 0
              });
              await updateAircraftFromParsedData(autoAttachAircraftId, entries, result.data?.extractedData);
            }

            // Update linked pilot if pilot logbook type
            const pilotDocTypes = ['pilot_logbook', 'logbook'];
            if (autoAttachPilotId && pilotDocTypes.includes(documentType) && entries.length > 0) {
              sendLog({
                step: 'structuring',
                message: 'Updating linked pilot records...',
                timestamp: new Date(),
                progress: 98,
                duration: 0
              });
              await updatePilotFromParsedData(autoAttachPilotId, entries);
            }

            sendLog({
              step: 'complete',
              message: 'Document processing complete!',
              timestamp: new Date(),
              progress: 100,
              duration: 0,
              details: {
                documentId: doc._id.toString(),
                filename: suggestedName,
                documentType,
                status: 'completed',
                entryCount: entries.length,
                totalHours: summary.totalHours
              }
            });

            sendEvent('complete', {
              documentId: doc._id.toString(),
              filename: suggestedName,
              originalFilename,
              documentType,
              status: 'completed',
              progress: 100,
              progressStep: 'complete',
              message: 'Document parsed successfully.',
              summary,
              analysis: analysis || undefined,
              filePath: storedFile?.relativePath,
              entryCount: entries.length,
              autoAttached: {
                pilotId: autoAttachPilotId !== pilotId ? autoAttachPilotId : undefined,
                aircraftId: autoAttachAircraftId !== aircraftId ? autoAttachAircraftId : undefined
              }
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
              message: `Processing failed: ${(parseError as Error).message}`,
              timestamp: new Date(),
              progress: 0,
              duration: 0,
              details: { error: (parseError as Error).message }
            });

            sendEvent('error', {
              message: (parseError as Error).message,
              documentId: doc._id.toString()
            });
          }
        } else {
          // For small files without a specific type, store and return
          sendLog({
            step: 'complete',
            message: 'File uploaded, ready for parsing',
            timestamp: new Date(),
            progress: 100,
            duration: 0,
            details: {
              documentId: doc._id.toString(),
              status: 'pending',
              needsManualParsing: true
            }
          });

          sendEvent('complete', {
            documentId: doc._id.toString(),
            filename: suggestedName,
            originalFilename,
            documentType,
            status: 'pending',
            progress: 0,
            progressStep: 'pending',
            message: 'File uploaded successfully. Ready for parsing.',
            analysis: analysis || undefined,
            filePath: storedFile?.relativePath,
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
