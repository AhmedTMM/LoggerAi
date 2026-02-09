import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { requireAuth } from '@/lib/auth-helpers';
import Aircraft from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';
import { classifyDocumentFast } from '@/lib/services/aiService';
import { saveFile } from '@/lib/services/fileStorage';
import { enqueueUploadJob } from '@/lib/services/backgroundProcessor';
import { fetchAircraftDetails } from '@/lib/services/firecrawlService';
import {
  mapDetectedTypeToStorageType,
  isPilotDocument,
  isAircraftDocument,
  invalidateAllCaches,
} from '@/lib/services/autoAttachService';
import {
  MONGODB_SAFE_SIZE,
  extractTailFromFilename,
  extractCategoryFromFilename,
  base64ToByteSize,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/services/documentUploadHelpers';

export const maxDuration = 60; // Only need 60s to accept and queue the upload

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileBase64, fileType, filename } = body;

    if (!fileBase64 || !fileType) {
      return NextResponse.json(
        { success: false, error: 'Missing fileBase64 or fileType' },
        { status: 400 }
      );
    }

    const fileSizeBytes = base64ToByteSize(fileBase64.length);
    if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File too large (max 50MB)' },
        { status: 400 }
      );
    }

    const { error, userId } = await requireAuth();
    if (error) return error;

    await dbConnect();

    // ---- Classify document ----
    const classification = await classifyDocumentFast(fileBase64, fileType);
    let documentType = 'other';
    let analysis: any = null;

    if (classification.success && classification.classification) {
      analysis = classification.classification;
      if (analysis.confidence >= 0.5) {
        documentType = mapDetectedTypeToStorageType(analysis.detectedType);
      }
    }

    // ---- Filename-based fallback classification ----
    const tailFromFilename = extractTailFromFilename(filename);
    const categoryFromFilename = extractCategoryFromFilename(filename);
    const filenameLower = (filename || '').toLowerCase();

    if (documentType === 'other') {
      const hasPersonName = filename && /[A-Z][a-z]+[A-Z][a-z]+/.test(filename);
      const hasLogbookKeyword = filenameLower.includes('logbook') || filenameLower.includes('log');

      if (hasPersonName && !tailFromFilename) {
        documentType = 'pilot_logbook';
        console.log(`[Classification] Detected pilot logbook from filename: ${filename}`);
        if (!analysis) {
          const nameMatch = filename.match(/([A-Z][a-z]+[A-Z][a-z]+)/);
          analysis = {
            detectedType: 'pilot_logbook',
            confidence: 0.7,
            suggestedName: filename,
            pilotName: nameMatch ? nameMatch[1] : null,
            summary: 'Pilot logbook detected from filename pattern',
          };
        }
      } else if (tailFromFilename && (hasLogbookKeyword || categoryFromFilename)) {
        documentType = 'maintenance';
        console.log(`[Classification] Detected maintenance from filename: ${filename}`);
        if (!analysis) {
          analysis = {
            detectedType: 'maintenance',
            confidence: 0.7,
            suggestedName: filename,
            aircraftTailNumbers: [tailFromFilename],
            summary: 'Aircraft maintenance log detected from filename pattern',
          };
        }
      } else if (tailFromFilename) {
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

    // Ensure pilot name is extracted for pilot logbooks
    if (['pilot_logbook', 'logbook'].includes(documentType) && analysis && !analysis.pilotName) {
      const nameMatch = filename?.match(/([A-Z][a-z]+[A-Z][a-z]+)/);
      if (nameMatch) {
        analysis.pilotName = nameMatch[1];
        console.log(`[Name Extraction] Extracted pilot name from filename: ${analysis.pilotName}`);
      } else {
        const simpleName = filename?.match(/([A-Z][a-z]+)\s*[A-Z][a-z]+/);
        if (simpleName) {
          analysis.pilotName = simpleName[0];
          console.log(`[Name Extraction] Extracted pilot name from filename: ${analysis.pilotName}`);
        }
      }
    }

    // ---- Save file to disk if large ----
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

    // ---- Match / create pilot & aircraft ----
    let pilotId: string | undefined;
    let aircraftId: string | undefined;
    const created = { pilot: false, aircraft: false };

    const isPilotDoc = isPilotDocument(analysis?.detectedType || 'other');
    const isAircraftDoc = isAircraftDocument(analysis?.detectedType || 'other');

    if (isPilotDoc && analysis?.pilotName) {
      const pilots = await Pilot.find({ userId }).select('_id name email').lean();
      const normalizedSearch = analysis.pilotName.toLowerCase().trim();

      const matchedPilot = pilots.find((p: any) =>
        (p.name || '').toLowerCase().includes(normalizedSearch) ||
        normalizedSearch.includes((p.name || '').toLowerCase())
      );

      if (matchedPilot) {
        pilotId = matchedPilot._id.toString();
      } else {
        try {
          const uniqueEmail = `${analysis.pilotName.toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@placeholder.com`;
          const newPilot = await Pilot.create({
            userId,
            name: analysis.pilotName,
            email: uniqueEmail,
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
        } catch (pilotError: any) {
          if (pilotError.code === 11000) {
            const existingPilot = await Pilot.findOne({
              userId,
              name: { $regex: new RegExp(analysis.pilotName, 'i') },
            });
            if (existingPilot) {
              pilotId = existingPilot._id.toString();
            }
          } else {
            throw pilotError;
          }
        }
      }
    }

    // Aircraft matching (prefer AI-matched tails, then classification tails, then filename)
    let tailNumbers = analysis?.matchedAircraftTails || analysis?.aircraftTailNumbers || [];
    if (tailNumbers.length === 0 && tailFromFilename) {
      tailNumbers = [tailFromFilename];
    }

    const shouldMatchAircraft = isAircraftDoc || documentType === 'maintenance';
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

      if (!aircraftId && tailNumbers[0]) {
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
          }
        } catch (err) {
          console.error('Failed to fetch aircraft details:', err);
        }

        try {
          const newAircraft = await Aircraft.create(aircraftData);
          aircraftId = newAircraft._id.toString();
          created.aircraft = true;
          invalidateAllCaches();

          if (!aircraftData.imageUrl) {
            fetchAircraftDetails(tailNumbers[0])
              .then((details) => {
                if (details.success && details.data?.imageUrl) {
                  Aircraft.findByIdAndUpdate(aircraftId, { imageUrl: details.data.imageUrl }).catch(console.error);
                }
              })
              .catch((err) => console.error('Failed to auto-fetch aircraft image:', err));
          }
        } catch (aircraftError: any) {
          if (aircraftError.code === 11000) {
            const existingAircraft = await Aircraft.findOne({ userId, tailNumber: tailNumbers[0].toUpperCase() });
            if (existingAircraft) {
              aircraftId = existingAircraft._id.toString();
            }
          } else {
            throw aircraftError;
          }
        }
      }
    }

    // ---- Create document with queued status ----
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
    const linkPromises: Promise<any>[] = [];
    if (pilotId) linkPromises.push(Pilot.findByIdAndUpdate(pilotId, { $addToSet: { linkedDocuments: doc._id } }));
    if (aircraftId) linkPromises.push(Aircraft.findByIdAndUpdate(aircraftId, { $addToSet: { linkedDocuments: doc._id } }));
    if (linkPromises.length > 0) await Promise.all(linkPromises);

    // Enqueue background job
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
      { success: false, error: 'An internal error occurred during upload' },
      { status: 500 }
    );
  }
}
