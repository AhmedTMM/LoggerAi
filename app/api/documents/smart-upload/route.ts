import { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { requireAuth } from '@/lib/auth-helpers';
import Aircraft, { LogbookCategory } from '@/lib/models/Aircraft';
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
  findCachedPilotByName,
  findCachedAircraftByTail
} from '@/lib/services/autoAttachService';
import {
  calculateSummary,
  detectEntryCategory,
  updatePilotExperience,
  updateAircraftFromEntries
} from '@/lib/services/documentProcessingUtils';

export const maxDuration = 300;

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

        // Authenticate user
        const { error: authError, userId } = await requireAuth();
        if (authError) {
          send({ type: 'error', message: 'Authentication required' });
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

        // Always save file to disk for reliability (avoids storing base64 in MongoDB)
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
          const pilots = await Pilot.find({ userId }).select('_id name email').lean();
          const normalizedSearch = analysis.pilotName.toLowerCase().trim();

          let matchedPilot = pilots.find((p: any) =>
            (p.name || '').toLowerCase().includes(normalizedSearch) ||
            normalizedSearch.includes((p.name || '').toLowerCase())
          );

          if (matchedPilot) {
            pilotId = matchedPilot._id;
            progress(45, `Linked to pilot: ${matchedPilot.name}`);
          } else {
            // Create new pilot
            progress(45, `Creating new pilot: ${analysis.pilotName}`);
            const newPilot = await Pilot.create({
              userId,
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
          const allAircraft = await Aircraft.find({ userId }).select('_id tailNumber').lean();

          for (const tail of tailNumbers) {
            const normalizedTail = tail.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const matchedAircraft = allAircraft.find((a: any) => {
              const acTail = (a.tailNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
              return acTail === normalizedTail || acTail.includes(normalizedTail) || normalizedTail.includes(acTail);
            });

          if (matchedAircraft) {
            aircraftId = matchedAircraft._id;
            progress(55, `Linked to aircraft: ${matchedAircraft.tailNumber}`);
          }

          // Create new aircraft if not found and this is an aircraft document
          if (!aircraftId && tailNumbers[0]) {
            progress(55, `Creating new aircraft: ${tailNumbers[0]}`);

            // Try to fetch enriched data from FAA registry
            let aircraftData: any = {
              userId,
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
            };

            try {
              progress(56, 'Fetching aircraft details from FAA registry...');
              const details = await fetchAircraftDetails(tailNumbers[0]);

              if (details.success && details.data) {
                // Merge enriched data
                aircraftData = {
                  ...aircraftData,
                  manufacturer: details.data.manufacturer || aircraftData.manufacturer,
                  model: details.data.model || aircraftData.model,
                  serial: details.data.serial || aircraftData.serial,
                  year: details.data.year || aircraftData.year,
                  imageUrl: details.data.imageUrl,
                  operatingLimits: details.data.operatingLimits,
                };
                progress(57, `Enriched aircraft data from FAA registry`);
              }
            } catch (error) {
              console.error('Failed to fetch aircraft details:', error);
              // Continue with basic data
            }

            const newAircraft = await Aircraft.create(aircraftData);
            aircraftId = newAircraft._id.toString();
            created.aircraft = true;
            invalidateAllCaches();
          }
        }

        progress(60, 'Creating document record...');

        // Create document
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

          // PARALLEL: Update pilot and aircraft simultaneously
          const updatePromises: Promise<void>[] = [];

          if (pilotId && ['pilot_logbook', 'logbook'].includes(documentType) && entries.length > 0) {
            updatePromises.push(updatePilotExperience(pilotId, entries));
          }

          if (aircraftId && ['aircraft_logbook', 'maintenance', 'inspection'].includes(documentType) && entries.length > 0) {
            updatePromises.push(updateAircraftFromEntries(aircraftId, entries, categoryFromFilename || undefined, userId));
          }

          if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
          }

          // Run audit if we have both pilot and aircraft
          let auditStatus: string | undefined;
          if (pilotId && aircraftId) {
            progress(95, 'Running safety audit...');
            try {
              const pilot = await Pilot.findById(pilotId);
              const aircraft = await Aircraft.findById(aircraftId);
              if (pilot && aircraft) {
                const auditResult = await runBasicLegalityAudit(aircraft, pilot, new Date(), 'KJFK');
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

