import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { auth } from '@/lib/auth';
import Aircraft, { LogbookCategory } from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';
import { classifyDocumentFast } from '@/lib/services/aiService';
import { saveFile } from '@/lib/services/fileStorage';
import { enqueueUploadJob } from '@/lib/services/backgroundProcessor';
import { fetchAircraftDetails } from '@/lib/services/firecrawlService';
import {
  mapDetectedTypeToStorageType,
  isPilotDocument,
  isAircraftDocument,
  invalidateAllCaches
} from '@/lib/services/autoAttachService';

export const maxDuration = 60; // Only need 60s to accept and queue the upload

const MONGODB_SAFE_SIZE = 10 * 1024 * 1024;

// Extract tail number from filename
function extractTailFromFilename(filename: string): string | null {
  if (!filename) return null;
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

export async function POST(request: NextRequest) {
  try {
    // Parse request
    const body = await request.json();
    const { fileBase64, fileType, filename } = body;

    if (!fileBase64 || !fileType) {
      return NextResponse.json(
        { success: false, error: 'Missing fileBase64 or fileType' },
        { status: 400 }
      );
    }

    const fileSizeBytes = Math.ceil((fileBase64.length * 3) / 4);
    if (fileSizeBytes > 50 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'File too large (max 50MB)' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Get authenticated user
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Classify document quickly
    const classification = await classifyDocumentFast(fileBase64, fileType);
    let documentType = 'other';
    let analysis: any = null;

    if (classification.success && classification.classification) {
      analysis = classification.classification;
      if (analysis.confidence >= 0.5) {
        documentType = mapDetectedTypeToStorageType(analysis.detectedType);
      }
    }

    // Filename-based fallback - check for pilot name or aircraft tail number
    const tailFromFilename = extractTailFromFilename(filename);
    const categoryFromFilename = extractCategoryFromFilename(filename);
    const filenameLower = (filename || '').toLowerCase();

    // Smart filename-based classification
    if (documentType === 'other') {
      // Check if filename contains a person's name (likely pilot logbook)
      // Names typically have capital letters in multiple parts, like "AhmedAbushagur"
      const hasPersonName = filename && /[A-Z][a-z]+[A-Z][a-z]+/.test(filename);
      const hasLogbookKeyword = filenameLower.includes('logbook') || filenameLower.includes('log');

      if (hasPersonName && !tailFromFilename) {
        // Person name without tail number = pilot logbook
        documentType = 'pilot_logbook';
        console.log(`[Classification] Detected pilot logbook from filename: ${filename}`);

        // Create basic analysis for pilot logbook
        if (!analysis) {
          const nameMatch = filename.match(/([A-Z][a-z]+[A-Z][a-z]+)/);
          analysis = {
            detectedType: 'pilot_logbook',
            confidence: 0.7,
            suggestedName: filename,
            pilotName: nameMatch ? nameMatch[1] : null,
            summary: 'Pilot logbook detected from filename pattern'
          };
        }
      } else if (tailFromFilename && (hasLogbookKeyword || categoryFromFilename)) {
        // Tail number + logbook keywords = aircraft maintenance
        documentType = 'maintenance';
        console.log(`[Classification] Detected maintenance from filename: ${filename}`);

        // Create basic analysis for maintenance
        if (!analysis) {
          analysis = {
            detectedType: 'maintenance',
            confidence: 0.7,
            suggestedName: filename,
            aircraftTailNumbers: [tailFromFilename],
            summary: 'Aircraft maintenance log detected from filename pattern'
          };
        }
      } else if (tailFromFilename) {
        // Just tail number = maintenance
        documentType = 'maintenance';

        if (!analysis) {
          analysis = {
            detectedType: 'maintenance',
            confidence: 0.6,
            aircraftTailNumbers: [tailFromFilename],
          };
        }
      }
    }

    // Save file to disk if large
    const isLargeFile = fileBase64.length > MONGODB_SAFE_SIZE;
    let storedFile: any = null;

    if (isLargeFile) {
      storedFile = await saveFile(
        fileBase64,
        filename || `doc_${Date.now()}.${fileType === 'pdf' ? 'pdf' : 'png'}`,
        fileType,
        'other'
      );
    }

    // Look for existing pilot/aircraft or create new ones
    let pilotId: string | undefined;
    let aircraftId: string | undefined;
    const created = { pilot: false, aircraft: false };

    const pilotTypes = isPilotDocument(analysis?.detectedType || 'other');
    const aircraftTypes = isAircraftDocument(analysis?.detectedType || 'other');

    // Try to match or create pilot
    if (pilotTypes && analysis?.pilotName) {
      const pilots = await Pilot.find({ userId }).select('_id name email').lean();
      const normalizedSearch = analysis.pilotName.toLowerCase().trim();

      let matchedPilot = pilots.find((p: any) =>
        (p.name || '').toLowerCase().includes(normalizedSearch) ||
        normalizedSearch.includes((p.name || '').toLowerCase())
      );

      if (matchedPilot) {
        pilotId = matchedPilot._id.toString();
      } else {
        // Create new pilot
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
          medicalExpiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          flightReviewExpiration: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        });
        pilotId = newPilot._id.toString();
        created.pilot = true;
        invalidateAllCaches();
      }
    }

    // Try to match or create aircraft
    let tailNumbers = analysis?.aircraftTailNumbers || [];
    if (tailNumbers.length === 0 && tailFromFilename) {
      tailNumbers = [tailFromFilename];
    }

    const shouldMatchAircraft = aircraftTypes || documentType === 'maintenance';
    if (shouldMatchAircraft && tailNumbers.length > 0) {
      const allAircraft = await Aircraft.find({ userId }).select('_id tailNumber').lean();

      for (const tail of tailNumbers) {
        const normalizedTail = tail.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const matchedAircraft = allAircraft.find((a: any) => {
          const acTail = (a.tailNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          return acTail === normalizedTail || acTail.includes(normalizedTail) || normalizedTail.includes(acTail);
        });

        if (matchedAircraft) {
          aircraftId = matchedAircraft._id.toString();
          break;
        }
      }

      // Create new aircraft if not found
      if (!aircraftId && tailNumbers[0]) {
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

    // Create document with queued status
    const doc = await ParsedDocument.create({
      userId,
      filename: filename || `document_${Date.now()}.${fileType === 'pdf' ? 'pdf' : 'png'}`,
      originalFilename: filename,
      documentType,
      fileType,
      status: 'queued',
      progress: 0,
      progressStep: 'queued',
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

    // Enqueue background job for processing
    enqueueUploadJob({
      documentId: doc._id.toString(),
      fileBase64,
      fileType,
      filename: filename || doc.filename,
      userId,
      documentType,
      pilotId,
      aircraftId,
      categoryFromFilename: categoryFromFilename || undefined,
    });

    console.log(`[Background-Upload] Queued document ${doc._id} for processing`);

    // Return immediately with document ID
    return NextResponse.json({
      success: true,
      documentId: doc._id.toString(),
      documentType,
      created,
      linkedPilot: pilotId,
      linkedAircraft: aircraftId,
      message: 'Upload queued for background processing',
    });

  } catch (error) {
    console.error('Background upload error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
