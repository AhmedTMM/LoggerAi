/**
 * Shared helpers for document upload routes.
 *
 * This module centralises logic that was previously duplicated across
 * upload, smart-upload, background-upload, upload-stream, and parse-document routes:
 *   - File validation & size constants
 *   - Filename-based metadata extraction (tail number, logbook category)
 *   - Entry extraction from parse results
 *   - Post-parse linked-record updates (pilot experience, aircraft maintenance)
 *   - Document status helpers
 */

import { LogbookCategory } from '@/lib/models/Aircraft';
import ParsedDocument from '@/lib/models/ParsedDocument';
import {
  PILOT_LOGBOOK_TYPES,
  AIRCRAFT_MAINTENANCE_TYPES,
  type DocumentType,
} from '@/lib/documentTypes';
import {
  calculateSummary,
  updatePilotExperience,
  updateAircraftFromEntries,
} from './documentProcessingUtils';

// ============ CONSTANTS ============

/** MongoDB has a 16 MB document limit. Base64 adds ~33 % overhead. */
export const MONGODB_SAFE_SIZE = 10 * 1024 * 1024; // 10 MB base64

/** Hard limit on uploaded files (actual binary size). */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

/** Allowed file-type values. */
export const ALLOWED_FILE_TYPES = ['pdf', 'image'] as const;

// ============ FILENAME HELPERS ============

/**
 * Extract a US tail number from a filename.
 * e.g. "N6196P-Airframe-Log-1.pdf" → "N6196P"
 */
export function extractTailFromFilename(filename: string): string | null {
  if (!filename) return null;
  const match = filename.match(/\b(N[0-9A-Z]{1,5})\b/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Infer the logbook category from a filename.
 * e.g. "N6196P-Engine-Log.pdf" → "engine"
 */
export function extractCategoryFromFilename(filename: string): LogbookCategory | null {
  if (!filename) return null;
  const lower = filename.toLowerCase();
  if (lower.includes('engine')) return 'engine';
  if (lower.includes('airframe')) return 'airframe';
  if (lower.includes('propeller') || lower.includes('prop')) return 'propeller';
  if (lower.includes('avionics')) return 'avionics';
  return null;
}

// ============ PARSE-RESULT HELPERS ============

/**
 * Normalise the entries array out of a parse result.
 *
 * The Reducto/Gemini output can be nested in several ways; this helper
 * handles all known shapes so callers don't have to repeat the fallback chain.
 */
export function extractEntriesFromResult(
  result: { data?: { extractedData?: any } }
): Record<string, any>[] {
  const extracted = result.data?.extractedData;
  if (!extracted) return [];
  if (Array.isArray(extracted.entries)) return extracted.entries;
  if (Array.isArray(extracted)) return extracted;
  return [];
}

// ============ POST-PARSE UPDATES ============

/**
 * After a document has been parsed, update linked pilot and/or aircraft records.
 *
 * Runs pilot experience and aircraft maintenance updates in parallel when both
 * apply, respecting the document type groupings from `documentTypes.ts`.
 */
export async function updateLinkedRecords(opts: {
  pilotId?: string;
  aircraftId?: string;
  documentType: string;
  entries: any[];
  filenameCategory?: LogbookCategory;
  userId?: string;
}): Promise<void> {
  const { pilotId, aircraftId, documentType, entries, filenameCategory, userId } = opts;
  if (entries.length === 0) return;

  const promises: Promise<void>[] = [];

  if (pilotId && PILOT_LOGBOOK_TYPES.includes(documentType as DocumentType)) {
    promises.push(updatePilotExperience(pilotId, entries));
  }

  if (aircraftId && AIRCRAFT_MAINTENANCE_TYPES.includes(documentType as DocumentType)) {
    promises.push(updateAircraftFromEntries(aircraftId, entries, filenameCategory, userId));
  }

  if (promises.length > 0) {
    await Promise.all(promises);
  }
}

// ============ DOCUMENT STATUS HELPERS ============

/**
 * Mark a document as failed with an error message.
 */
export async function markDocumentFailed(
  docId: string,
  error: string,
  userId?: string,
): Promise<void> {
  const filter: Record<string, any> = { _id: docId };
  if (userId) filter.userId = userId;

  await ParsedDocument.findOneAndUpdate(filter, {
    status: 'failed',
    progress: 0,
    progressStep: 'failed',
    error,
  });
}

/**
 * Mark a document as completed with parsed data.
 */
export async function markDocumentComplete(
  docId: string,
  data: {
    entries: any[];
    rawOutput: any;
    documentType?: string;
  },
  userId?: string,
): Promise<{ entries: any[]; summary: ReturnType<typeof calculateSummary> }> {
  const { entries, rawOutput, documentType } = data;
  const summary = calculateSummary(entries, documentType);

  const filter: Record<string, any> = { _id: docId };
  if (userId) filter.userId = userId;

  await ParsedDocument.findOneAndUpdate(filter, {
    status: 'completed',
    progress: 100,
    progressStep: 'complete',
    parsedAt: new Date(),
    rawOutput,
    entries,
    summary,
  });

  return { entries, summary };
}

/**
 * Update the progress/step of a document.
 */
export async function updateDocumentProgress(
  docId: string,
  progress: number,
  progressStep: string,
  status?: string,
  userId?: string,
): Promise<void> {
  const filter: Record<string, any> = { _id: docId };
  if (userId) filter.userId = userId;

  const update: Record<string, any> = { progress, progressStep };
  if (status) update.status = status;

  await ParsedDocument.findOneAndUpdate(filter, update);
}

// ============ VALIDATION ============

/**
 * Compute the actual binary size from a base64 string length.
 */
export function base64ToByteSize(base64Length: number): number {
  return Math.ceil((base64Length * 3) / 4);
}

/**
 * Validate common upload fields. Returns an error string or null if valid.
 */
export function validateUploadPayload(body: {
  fileBase64?: string;
  fileType?: string;
}): string | null {
  if (!body.fileBase64 || !body.fileType) {
    return 'Missing required fields: fileBase64, fileType';
  }
  if (!ALLOWED_FILE_TYPES.includes(body.fileType as any)) {
    return `Invalid file type. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}`;
  }
  const sizeBytes = base64ToByteSize(body.fileBase64.length);
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return `File too large. Maximum size is 50MB. Your file is ${Math.round(sizeBytes / 1024 / 1024)}MB`;
  }
  return null;
}

/**
 * Resolve the parse type for the extraction service.
 * POH documents are treated as logbooks for extraction purposes.
 */
export function resolveParseType(documentType: string): string {
  return documentType === 'poh' ? 'logbook' : documentType;
}
