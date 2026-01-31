import Pilot from '@/lib/models/Pilot';
import Aircraft from '@/lib/models/Aircraft';
import { FastDocumentClassification } from './aiService';
import { DocumentType, DetectedDocumentType, DOCUMENT_TYPE_META } from '@/lib/models/ParsedDocument';

export interface AutoAttachmentResult {
  suggestedPilotId?: string;
  suggestedPilotName?: string;
  suggestedAircraftId?: string;
  suggestedAircraftTail?: string;
  attachmentConfidence: number;
  attachmentReason: string;
  documentType: DocumentType;
}

// ============ ULTRA-FAST CACHING LAYER ============
// Cache pilot/aircraft data for rapid lookups (avoids DB round-trips)
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL = 60 * 1000; // 1 minute cache (fast invalidation for hackathon demo)
let pilotCache: CacheEntry<any[]> | null = null;
let aircraftCache: CacheEntry<any[]> | null = null;

async function getCachedPilots(): Promise<any[]> {
  const now = Date.now();
  if (pilotCache && (now - pilotCache.timestamp) < CACHE_TTL) {
    return pilotCache.data;
  }
  const pilots = await Pilot.find({}).select('_id name email').lean();
  pilotCache = { data: pilots, timestamp: now };
  return pilots;
}

async function getCachedAircraft(): Promise<any[]> {
  const now = Date.now();
  if (aircraftCache && (now - aircraftCache.timestamp) < CACHE_TTL) {
    return aircraftCache.data;
  }
  const aircraft = await Aircraft.find({}).select('_id tailNumber').lean();
  aircraftCache = { data: aircraft, timestamp: now };
  return aircraft;
}

// Export cache invalidation for when data changes
export function invalidatePilotCache() { pilotCache = null; }
export function invalidateAircraftCache() { aircraftCache = null; }
export function invalidateAllCaches() { pilotCache = null; aircraftCache = null; }

/**
 * Maps detected document types to storage document types
 * Handles legacy 'logbook' type and 'unknown' type
 */
export function mapDetectedTypeToStorageType(detectedType: DetectedDocumentType): DocumentType {
  if (detectedType === 'unknown') {
    return 'other';
  }
  return detectedType as DocumentType;
}

/**
 * Determines if a document type is primarily for pilots
 */
export function isPilotDocument(type: DetectedDocumentType): boolean {
  const pilotTypes: DetectedDocumentType[] = [
    'pilot_logbook', 'medical', 'certificate', 'endorsement', 'checkout'
  ];
  return pilotTypes.includes(type);
}

/**
 * Determines if a document type is primarily for aircraft
 */
export function isAircraftDocument(type: DetectedDocumentType): boolean {
  const aircraftTypes: DetectedDocumentType[] = [
    'aircraft_logbook', 'maintenance', 'inspection', 'poh', 'weight_balance',
    'insurance', 'registration', 'ad_compliance', 'service_bulletin'
  ];
  return aircraftTypes.includes(type);
}

/**
 * Fuzzy match a pilot name against existing pilots
 * Returns the best match if confidence is high enough
 * NOW WITH CACHING for ultra-fast lookups!
 */
async function matchPilot(pilotName: string | undefined): Promise<{
  pilotId: string;
  pilotName: string;
  confidence: number;
} | null> {
  if (!pilotName || pilotName.trim().length < 2) return null;

  const normalizedSearch = pilotName.toLowerCase().trim();
  const pilots = await getCachedPilots(); // Use cached data!

  let bestMatch: { pilotId: string; pilotName: string; confidence: number } | null = null;

  for (const pilot of pilots) {
    const normalizedName = (pilot.name || '').toLowerCase();

    // Exact match
    if (normalizedName === normalizedSearch) {
      return {
        pilotId: pilot._id.toString(),
        pilotName: pilot.name,
        confidence: 1.0
      };
    }

    // Check if search is contained in name or vice versa
    if (normalizedName.includes(normalizedSearch) || normalizedSearch.includes(normalizedName)) {
      const confidence = Math.min(normalizedSearch.length, normalizedName.length) /
        Math.max(normalizedSearch.length, normalizedName.length);
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = {
          pilotId: pilot._id.toString(),
          pilotName: pilot.name,
          confidence: confidence * 0.9 // Partial match penalty
        };
      }
    }

    // Check individual name parts (first/last name matching)
    const searchParts = normalizedSearch.split(/\s+/);
    const nameParts = normalizedName.split(/\s+/);

    let partsMatched = 0;
    for (const searchPart of searchParts) {
      if (nameParts.some((np: string) => np === searchPart || np.startsWith(searchPart))) {
        partsMatched++;
      }
    }

    if (partsMatched > 0) {
      const confidence = partsMatched / Math.max(searchParts.length, nameParts.length);
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = {
          pilotId: pilot._id.toString(),
          pilotName: pilot.name,
          confidence: confidence * 0.85 // Partial name match penalty
        };
      }
    }
  }

  // Only return if confidence is reasonable
  return bestMatch && bestMatch.confidence >= 0.5 ? bestMatch : null;
}

/**
 * Match aircraft tail numbers against existing aircraft
 * Returns the best match
 * NOW WITH CACHING for ultra-fast lookups!
 */
async function matchAircraft(tailNumbers: string[] | undefined): Promise<{
  aircraftId: string;
  tailNumber: string;
  confidence: number;
} | null> {
  if (!tailNumbers || tailNumbers.length === 0) return null;

  const aircraft = await getCachedAircraft(); // Use cached data!

  for (const tail of tailNumbers) {
    const normalizedTail = tail.toUpperCase().replace(/[^A-Z0-9]/g, '');

    for (const ac of aircraft) {
      const normalizedAcTail = (ac.tailNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

      // Exact match
      if (normalizedAcTail === normalizedTail) {
        return {
          aircraftId: ac._id.toString(),
          tailNumber: ac.tailNumber,
          confidence: 1.0
        };
      }

      // Partial match (e.g., "6196P" matching "N6196P")
      if (normalizedAcTail.includes(normalizedTail) || normalizedTail.includes(normalizedAcTail)) {
        return {
          aircraftId: ac._id.toString(),
          tailNumber: ac.tailNumber,
          confidence: 0.9
        };
      }
    }
  }

  return null;
}

/**
 * Automatically suggest attachments for a document based on AI classification
 * This queries existing pilots and aircraft to find matches
 * ULTRA-FAST: Runs pilot + aircraft matching in PARALLEL with caching!
 */
export async function suggestAttachments(
  classification: FastDocumentClassification
): Promise<AutoAttachmentResult> {
  const documentType = mapDetectedTypeToStorageType(classification.detectedType);

  const result: AutoAttachmentResult = {
    attachmentConfidence: 0,
    attachmentReason: '',
    documentType
  };

  const isPilotDoc = isPilotDocument(classification.detectedType);
  const isAircraftDoc = isAircraftDocument(classification.detectedType);

  // PARALLEL: Match pilot AND aircraft simultaneously for maximum speed!
  const [pilotMatch, aircraftMatch] = await Promise.all([
    matchPilot(classification.matchedPilotName || classification.pilotName),
    matchAircraft(classification.matchedAircraftTails || classification.aircraftTailNumbers)
  ]);

  // Build result based on document type and matches
  // Note: Pilot logbooks should ONLY link to pilots (they contain flights on many aircraft)
  // Aircraft logbooks should ONLY link to aircraft (they track a single airframe)
  if (isPilotDoc && pilotMatch) {
    result.suggestedPilotId = pilotMatch.pilotId;
    result.suggestedPilotName = pilotMatch.pilotName;
    result.attachmentConfidence = pilotMatch.confidence * classification.confidence;
    result.attachmentReason = `Pilot name "${pilotMatch.pilotName}" found in document`;
    // Don't attach pilot logbooks to aircraft - they reference many aircraft
  } else if (isAircraftDoc && aircraftMatch) {
    result.suggestedAircraftId = aircraftMatch.aircraftId;
    result.suggestedAircraftTail = aircraftMatch.tailNumber;
    result.attachmentConfidence = aircraftMatch.confidence * classification.confidence;
    result.attachmentReason = `Aircraft tail number "${aircraftMatch.tailNumber}" found in document`;
  } else if (pilotMatch) {
    // Generic document with pilot name
    result.suggestedPilotId = pilotMatch.pilotId;
    result.suggestedPilotName = pilotMatch.pilotName;
    result.attachmentConfidence = pilotMatch.confidence * classification.confidence * 0.8;
    result.attachmentReason = `Pilot name "${pilotMatch.pilotName}" found`;
  } else if (aircraftMatch) {
    // Generic document with tail number
    result.suggestedAircraftId = aircraftMatch.aircraftId;
    result.suggestedAircraftTail = aircraftMatch.tailNumber;
    result.attachmentConfidence = aircraftMatch.confidence * classification.confidence * 0.8;
    result.attachmentReason = `Aircraft "${aircraftMatch.tailNumber}" found`;
  } else {
    result.attachmentReason = 'No matching pilot or aircraft found';
  }

  return result;
}

/**
 * Auto-attach a document to pilot/aircraft based on suggestions
 * Only attaches if confidence is above threshold
 */
export async function autoAttachDocument(
  documentId: string,
  suggestions: AutoAttachmentResult,
  confidenceThreshold: number = 0.7
): Promise<{ attached: boolean; message: string }> {
  if (suggestions.attachmentConfidence < confidenceThreshold) {
    return {
      attached: false,
      message: `Confidence ${(suggestions.attachmentConfidence * 100).toFixed(0)}% below threshold ${(confidenceThreshold * 100).toFixed(0)}%`
    };
  }

  // Import here to avoid circular dependency
  const ParsedDocument = (await import('@/lib/models/ParsedDocument')).default;

  const updates: Record<string, any> = {};

  if (suggestions.suggestedPilotId) {
    updates.pilot = suggestions.suggestedPilotId;

    // Also add to pilot's linkedDocuments
    await Pilot.findByIdAndUpdate(
      suggestions.suggestedPilotId,
      { $addToSet: { linkedDocuments: documentId } }
    );
  }

  if (suggestions.suggestedAircraftId) {
    updates.aircraft = suggestions.suggestedAircraftId;

    // Also add to aircraft's linkedDocuments
    await Aircraft.findByIdAndUpdate(
      suggestions.suggestedAircraftId,
      { $addToSet: { linkedDocuments: documentId } }
    );
  }

  if (Object.keys(updates).length > 0) {
    await ParsedDocument.findByIdAndUpdate(documentId, updates);
    return {
      attached: true,
      message: suggestions.attachmentReason
    };
  }

  return {
    attached: false,
    message: 'No attachment targets specified'
  };
}
