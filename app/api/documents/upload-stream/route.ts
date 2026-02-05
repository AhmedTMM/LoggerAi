import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Aircraft from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';
import { requireAuth } from '@/lib/auth-helpers';
import { parseDocumentUltraFast, StepLog } from '@/lib/services/reductoService';
import { classifyDocumentFast } from '@/lib/services/aiService';
import { saveFile } from '@/lib/services/fileStorage';
import { suggestAttachments, mapDetectedTypeToStorageType } from '@/lib/services/autoAttachService';
import { calculateSummary, updatePilotExperience, updateAircraftFromEntries } from '@/lib/services/documentProcessingUtils';

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
        // Authenticate user
        const { error: authError, userId } = await requireAuth();
        if (authError) {
          sendEvent('error', { message: 'Authentication required' });
          controller.close();
          return;
        }

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

        // Validate optional IDs
        if (aircraftId && !mongoose.Types.ObjectId.isValid(aircraftId)) {
          sendEvent('error', { message: 'Invalid aircraft ID' });
          controller.close();
          return;
        }
        if (pilotId && !mongoose.Types.ObjectId.isValid(pilotId)) {
          sendEvent('error', { message: 'Invalid pilot ID' });
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
          userId,
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
            await updatePilotExperience(autoAttachPilotId, entries);
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
          sendEvent('error', { message: 'An error occurred while processing the document', documentId: doc._id.toString() });
        }

      } catch (error) {
        console.error('Upload stream error:', error);
        sendEvent('error', { message: 'An internal error occurred during upload' });
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
