import { NextRequest } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { requireAuth } from '@/lib/auth-helpers';
import Aircraft from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';
import { parseDocumentUltraFast } from '@/lib/services/reductoService';
import { classifyDocumentFast } from '@/lib/services/aiService';
import { saveFile } from '@/lib/services/fileStorage';
import { runBasicLegalityAudit } from '@/lib/services/auditEngine';
import { fetchAircraftDetails } from '@/lib/services/firecrawlService';
import {
  mapDetectedTypeToStorageType,
  isPilotDocument,
  isAircraftDocument,
  invalidateAllCaches,
} from '@/lib/services/autoAttachService';
import {
  extractTailFromFilename,
  extractCategoryFromFilename,
  extractEntriesFromResult,
  updateLinkedRecords,
  base64ToByteSize,
  MAX_FILE_SIZE_BYTES,
  resolveParseType,
} from '@/lib/services/documentUploadHelpers';
import { calculateSummary } from '@/lib/services/documentProcessingUtils';

export const maxDuration = 300;

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
        try { controller.close(); } catch { /* already closed */ }
      };

      const progress = (percent: number, message: string) => {
        send({ type: 'progress', progress: percent, message });
      };

      try {
        // ---- Parse & validate request ----
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

        if (base64ToByteSize(fileBase64.length) > MAX_FILE_SIZE_BYTES) {
          send({ type: 'error', message: 'File too large (max 50MB)' });
          safeClose();
          return;
        }

        const { error: authError, userId } = await requireAuth();
        if (authError) {
          send({ type: 'error', message: 'Authentication required' });
          safeClose();
          return;
        }

        progress(5, 'Connecting to database...');
        await dbConnect();

        // ---- Classify document ----
        progress(10, 'Analyzing document with AI...');
        const classification = await classifyDocumentFast(fileBase64, fileType);
        let documentType = 'other';
        let analysis: any = null;

        if (classification.success && classification.classification) {
          analysis = classification.classification;
          if (analysis.confidence >= 0.5) {
            documentType = mapDetectedTypeToStorageType(analysis.detectedType);
          }
        }

        // Filename-based fallback
        const tailFromFilename = extractTailFromFilename(filename);
        const categoryFromFilename = extractCategoryFromFilename(filename);

        if (documentType === 'other' && (tailFromFilename || categoryFromFilename)) {
          documentType = 'maintenance';
          progress(20, `Filename suggests maintenance log for ${tailFromFilename || 'aircraft'}`);
        }

        progress(25, `Detected: ${documentType}`);

        // ---- Save file to disk ----
        progress(30, 'Saving file...');
        let storedFile: any = null;
        try {
          storedFile = await saveFile(
            fileBase64,
            filename || `doc_${Date.now()}.${fileType === 'pdf' ? 'pdf' : 'png'}`,
            fileType,
            'other'
          );
        } catch (saveErr) {
          console.error('[Smart-Upload] File save error:', saveErr);
        }

        // ---- Match / create pilot & aircraft ----
        progress(35, 'Looking for matches...');
        let pilotId: string | undefined;
        let aircraftId: string | undefined;
        const created = { pilot: false, aircraft: false };

        const isPilotDoc = isPilotDocument(analysis?.detectedType || 'other');
        const isAircraftDoc = isAircraftDocument(analysis?.detectedType || 'other');

        // Pilot matching
        if (isPilotDoc && analysis?.pilotName) {
          progress(40, 'Matching pilot...');
          const pilots = await Pilot.find({ userId }).select('_id name email').lean();
          const normalizedSearch = analysis.pilotName.toLowerCase().trim();

          const matchedPilot = pilots.find((p: any) =>
            (p.name || '').toLowerCase().includes(normalizedSearch) ||
            normalizedSearch.includes((p.name || '').toLowerCase())
          );

          if (matchedPilot) {
            pilotId = matchedPilot._id.toString();
            progress(45, `Linked to pilot: ${matchedPilot.name}`);
          } else {
            progress(45, `Creating new pilot: ${analysis.pilotName}`);
            const newPilot = await Pilot.create({
              userId,
              name: analysis.pilotName,
              email: `${analysis.pilotName.toLowerCase().replace(/\s+/g, '.')}@placeholder.com`,
              certificates: { type: 'PPL', instrumentRated: false, multiEngineRated: false },
              endorsements: [],
              experience: {
                totalHours: 0, picHours: 0, nightHours: 0, ifrHours: 0,
                crossCountryHours: 0, last90DaysHours: 0, last30DaysHours: 0,
              },
              medicalExpiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              flightReviewExpiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            });
            pilotId = newPilot._id.toString();
            created.pilot = true;
            invalidateAllCaches();
          }
        }

        // Aircraft matching
        let tailNumbers = analysis?.aircraftTailNumbers || [];
        if (tailNumbers.length === 0 && tailFromFilename) {
          tailNumbers = [tailFromFilename];
        }

        const shouldMatchAircraft = isAircraftDoc || documentType === 'maintenance';
        if (shouldMatchAircraft && tailNumbers.length > 0) {
          progress(50, 'Matching aircraft...');
          const allAircraft = await Aircraft.find({ userId }).select('_id tailNumber').lean();

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

          // Create new aircraft if not found
          if (!aircraftId && tailNumbers[0]) {
            progress(55, `Creating new aircraft: ${tailNumbers[0]}`);
            let aircraftData: any = {
              userId,
              tailNumber: tailNumbers[0].toUpperCase(),
              model: analysis?.aircraftType || 'Unknown',
              serial: 'Unknown',
              manufacturer: 'Unknown',
              year: new Date().getFullYear(),
              maintenanceDates: { annual: new Date(), transponder: new Date(), staticSystem: new Date() },
              currentHours: { hobbs: 0, tach: 0 },
              logs: [],
            };

            try {
              progress(56, 'Fetching aircraft details from FAA registry...');
              const details = await fetchAircraftDetails(tailNumbers[0]);
              if (details.success && details.data) {
                aircraftData = {
                  ...aircraftData,
                  manufacturer: details.data.manufacturer || aircraftData.manufacturer,
                  model: details.data.model || aircraftData.model,
                  serial: details.data.serial || aircraftData.serial,
                  year: details.data.year || aircraftData.year,
                  imageUrl: details.data.imageUrl,
                  operatingLimits: details.data.operatingLimits,
                };
                progress(57, 'Enriched aircraft data from FAA registry');
              }
            } catch (err) {
              console.error('Failed to fetch aircraft details:', err);
            }

            const newAircraft = await Aircraft.create(aircraftData);
            aircraftId = newAircraft._id.toString();
            created.aircraft = true;
            invalidateAllCaches();
          }
        }

        // ---- Create document record ----
        progress(60, 'Creating document record...');
        const fileSizeBytes = base64ToByteSize(fileBase64.length);
        const doc = await ParsedDocument.create({
          userId,
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
        });

        // Link document to pilot/aircraft
        const linkPromises: Promise<any>[] = [];
        if (pilotId) linkPromises.push(Pilot.findByIdAndUpdate(pilotId, { $addToSet: { linkedDocuments: doc._id } }));
        if (aircraftId) linkPromises.push(Aircraft.findByIdAndUpdate(aircraftId, { $addToSet: { linkedDocuments: doc._id } }));
        if (linkPromises.length > 0) await Promise.all(linkPromises);

        // ---- Parse the document ----
        progress(65, 'Extracting data from document...');
        try {
          const result = await parseDocumentUltraFast(
            fileBase64,
            fileType,
            resolveParseType(documentType),
            (log) => {
              const mappedProgress = 65 + Math.round((log.progress / 100) * 25);
              progress(mappedProgress, log.message);
            }
          );

          if (!result.success) {
            await ParsedDocument.findByIdAndUpdate(doc._id, { status: 'failed', error: result.error });
            send({ type: 'error', message: result.error });
            safeClose();
            return;
          }

          const entries = extractEntriesFromResult(result);
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

          progress(92, 'Updating linked records...');
          await updateLinkedRecords({
            pilotId,
            aircraftId,
            documentType,
            entries,
            filenameCategory: categoryFromFilename || undefined,
            userId,
          });

          // Run audit if we have both pilot and aircraft
          let auditStatus: string | undefined;
          if (pilotId && aircraftId) {
            progress(95, 'Running safety audit...');
            try {
              const [pilot, aircraft] = await Promise.all([
                Pilot.findById(pilotId),
                Aircraft.findById(aircraftId),
              ]);
              if (pilot && aircraft) {
                const auditResult = await runBasicLegalityAudit(aircraft, pilot, new Date(), 'KJFK');
                auditStatus = auditResult.overallStatus;

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
          send({ type: 'error', message: 'An error occurred while processing the document' });
        }
      } catch (error) {
        console.error('Smart upload error:', error);
        send({ type: 'error', message: 'An internal error occurred during upload' });
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
