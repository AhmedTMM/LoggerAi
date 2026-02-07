import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Aircraft, { LogbookCategory } from '@/lib/models/Aircraft';
import Pilot from '@/lib/models/Pilot';
import { runBasicLegalityAudit } from '@/lib/services/auditEngine';
import { invalidateAllCaches } from '@/lib/services/autoAttachService';
import {
  calculateSummary,
  updatePilotExperience,
  updateAircraftFromEntries
} from '@/lib/services/documentProcessingUtils';

// Simple in-memory job queue
interface UploadJob {
  documentId: string;
  fileBase64: string;
  fileType: string;
  filename: string;
  userId: string;
  documentType: string;
  pilotId?: string;
  aircraftId?: string;
  categoryFromFilename?: LogbookCategory;
}

const jobQueue: UploadJob[] = [];
let isProcessing = false;

// Add a job to the queue
export function enqueueUploadJob(job: UploadJob) {
  jobQueue.push(job);
  processQueue(); // Start processing if not already running
}

// Process jobs in the queue
async function processQueue() {
  if (isProcessing || jobQueue.length === 0) return;

  isProcessing = true;

  while (jobQueue.length > 0) {
    const job = jobQueue.shift();
    if (job) {
      try {
        await processUploadJob(job);
      } catch (error) {
        console.error('Background job failed:', error);
      }
    }
  }

  isProcessing = false;
}

// Process a single upload job
async function processUploadJob(job: UploadJob) {
  const { documentId, fileBase64, fileType, userId, documentType, pilotId, aircraftId, categoryFromFilename } = job;

  try {
    await dbConnect();

    // Update status to parsing
    await ParsedDocument.findByIdAndUpdate(documentId, {
      status: 'parsing',
      progress: 10,
      progressStep: 'processing',
    });

    // Parse the document using Reducto OCR + Gemini (high quality)
    const parseType = documentType === 'poh' ? 'logbook' : documentType;
    const { parseDocumentFast } = await import('@/lib/services/reductoService');
    const result = await parseDocumentFast(
      fileBase64,
      fileType as 'pdf' | 'image',
      parseType,
      async (log) => {
        const mappedProgress = 10 + Math.round((log.progress / 100) * 70);
        await ParsedDocument.findByIdAndUpdate(documentId, {
          progress: mappedProgress,
          progressStep: 'extracting',
        });
      }
    );

    if (!result.success) {
      await ParsedDocument.findByIdAndUpdate(documentId, {
        status: 'failed',
        progressStep: 'failed',
        error: result.error,
      });
      return;
    }

    const entries = result.data?.extractedData?.entries ||
      (Array.isArray(result.data?.extractedData) ? result.data?.extractedData : []);

    const summary = calculateSummary(entries, documentType);

    // Fetch historical weather for pilot logbook entries
    if (['pilot_logbook', 'logbook'].includes(documentType) && entries.length > 0) {
      await enrichEntriesWithHistoricalWeather(entries);
      // Research and enrich aircraft information from logbook
      await enrichEntriesWithAircraftDetails(entries, userId);
    }

    // Update document with parsed data
    await ParsedDocument.findByIdAndUpdate(documentId, {
      status: 'completed',
      progress: 90,
      progressStep: 'processing',
      parsedAt: new Date(),
      rawOutput: result.data?.extractedData,
      entries,
      summary,
    });

    // Update pilot experience from logbook
    if (pilotId && ['pilot_logbook', 'logbook'].includes(documentType) && entries.length > 0) {
      await updatePilotExperience(pilotId, entries);
    }

    // Update aircraft from maintenance docs
    if (aircraftId && ['aircraft_logbook', 'maintenance', 'inspection'].includes(documentType) && entries.length > 0) {
      await updateAircraftFromEntries(aircraftId, entries, categoryFromFilename, userId);
    }

    // Run audit if we have both pilot and aircraft
    let auditStatus: string | undefined;
    if (pilotId && aircraftId) {
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

    // Final update
    await ParsedDocument.findByIdAndUpdate(documentId, {
      status: 'completed',
      progress: 100,
      progressStep: 'complete',
    });
  } catch (error) {
    console.error(`[BackgroundProcessor] Error processing document ${documentId}:`, error);
    await ParsedDocument.findByIdAndUpdate(documentId, {
      status: 'failed',
      progressStep: 'failed',
      error: (error as Error).message,
    });
  }
}


/**
 * Fetch historical weather for logbook entries and attach to each entry
 */
async function enrichEntriesWithHistoricalWeather(entries: any[]) {
  const { fetchHistoricalMETAR } = await import('@/lib/services/historicalWeatherService');
  const batchSize = 5;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (entry) => {
        // Skip if entry doesn't have required fields
        if (!entry.date || !entry.from) return;

        // Skip if weather already exists
        if (entry.weather) return;

        try {
          const flightDate = new Date(entry.date);
          const weather = await fetchHistoricalMETAR(entry.from, flightDate);

          if (weather) {
            entry.weather = {
              ...weather.conditions,
              metar: weather.metar,
              flightCategory: weather.conditions.flightCategory,
              station: entry.from,
            };
          }
        } catch (error) {
          console.error(`[BackgroundProcessor] Failed to fetch weather for ${entry.from} on ${entry.date}:`, error);
        }
      })
    );

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

/**
 * Research aircraft from logbook entries and enrich with make/model details
 */
async function enrichEntriesWithAircraftDetails(entries: any[], userId: string) {
  const { fetchAircraftDetails } = await import('@/lib/services/firecrawlService');

  // Extract unique aircraft identifiers from entries
  const aircraftMap = new Map<string, any>();

  for (const entry of entries) {
    const tailNumber = entry.aircraftIdent || entry.tailNumber;
    if (!tailNumber) continue;

    // Normalize tail number (uppercase, remove spaces)
    const normalizedTail = tailNumber.toUpperCase().trim().replace(/\s+/g, '');
    if (normalizedTail && !aircraftMap.has(normalizedTail)) {
      aircraftMap.set(normalizedTail, { tailNumber: normalizedTail, entries: [] });
    }

    if (normalizedTail) {
      aircraftMap.get(normalizedTail)?.entries.push(entry);
    }
  }

  if (aircraftMap.size === 0) return;

  // Find or create aircraft records
  for (const [tailNumber, data] of Array.from(aircraftMap.entries())) {
    try {
      // Check if aircraft already exists
      let aircraft = await Aircraft.findOne({ userId, tailNumber });

      if (!aircraft) {
        // Fetch aircraft details from FAA registry
        const details = await fetchAircraftDetails(tailNumber);

        const aircraftData: any = {
          userId,
          tailNumber,
          model: details.success && details.data?.model ? details.data.model : 'Unknown',
          serial: details.success && details.data?.serial ? details.data.serial : 'Unknown',
          manufacturer: details.success && details.data?.manufacturer ? details.data.manufacturer : 'Unknown',
          year: details.success && details.data?.year ? details.data.year : new Date().getFullYear(),
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

        if (details.success && details.data) {
          if (details.data.imageUrl) aircraftData.imageUrl = details.data.imageUrl;
          if (details.data.operatingLimits) aircraftData.operatingLimits = details.data.operatingLimits;
        }

        aircraft = await Aircraft.create(aircraftData);
        invalidateAllCaches();
      } else if (aircraft.model === 'Unknown' || !aircraft.manufacturer || aircraft.manufacturer === 'Unknown') {
        // Aircraft exists but lacks details, try to enrich

        const details = await fetchAircraftDetails(tailNumber);

        if (details.success && details.data) {
          const updateFields: any = {};
          if (details.data.manufacturer) updateFields.manufacturer = details.data.manufacturer;
          if (details.data.model) updateFields.model = details.data.model;
          if (details.data.serial) updateFields.serial = details.data.serial;
          if (details.data.year) updateFields.year = details.data.year;
          if (details.data.imageUrl) updateFields.imageUrl = details.data.imageUrl;
          if (details.data.operatingLimits) updateFields.operatingLimits = details.data.operatingLimits;

          await Aircraft.updateOne({ _id: aircraft._id }, { $set: updateFields });
        }
      }

      // Attach aircraft info to entries
      for (const entry of data.entries) {
        entry.aircraftInfo = {
          tailNumber: aircraft.tailNumber,
          manufacturer: aircraft.manufacturer,
          model: aircraft.model,
          year: aircraft.year,
        };
      }
    } catch (error) {
      console.error(`[BackgroundProcessor] Failed to process aircraft ${tailNumber}:`, error);
    }

    // Small delay between aircraft lookups to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
