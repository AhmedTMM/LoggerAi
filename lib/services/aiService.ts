import {
  isOpenRouterConfigured,
  generateVisionCompletion,
  parseJsonResponse,
  OPENROUTER_MODELS,
} from './openRouterClient';
import { DetectedDocumentType } from '@/lib/models/ParsedDocument';

// Document classification result type with expanded types
export interface FastDocumentClassification {
  detectedType: DetectedDocumentType;
  confidence: number;
  suggestedName: string;
  pilotName?: string;
  aircraftTailNumbers?: string[];
  dateRange?: { from: string; to: string };
  estimatedEntryCount: number;
  documentQuality: 'excellent' | 'good' | 'fair' | 'poor';
  qualityNotes: string[];
  isHandwritten: boolean;
  pageCount?: number;
  summary: string;
  // For auto-attachment matching
  matchedPilotName?: string;    // Exact pilot name found in document
  matchedAircraftTails?: string[]; // Tail numbers found in document
}

/**
 * Fast document classification using AI vision
 * Analyzes document images/PDFs to determine type without heavy extraction
 * Target: Under 10 seconds for classification
 */
export async function classifyDocumentFast(
  fileBase64: string,
  fileType: 'pdf' | 'image'
): Promise<{ success: boolean; classification?: FastDocumentClassification; error?: string }> {
  const startTime = Date.now();

  try {
    if (!isOpenRouterConfigured()) {
      throw new Error("Missing OPENROUTER_API_KEY");
    }

    // For large files, skip classification - truncating PDFs creates invalid documents
    const MAX_CLASSIFIABLE_SIZE = 25 * 1024 * 1024; // 25MB max for classification (~19MB actual file)

    if (fileBase64.length > MAX_CLASSIFIABLE_SIZE) {
      const fileSizeMB = (fileBase64.length / 1024 / 1024).toFixed(1);
      console.log(`[FastClassify] File too large for classification (${fileSizeMB}MB > ${(MAX_CLASSIFIABLE_SIZE / 1024 / 1024).toFixed(1)}MB). Using default classification.`);
      // Return a default classification for very large files
      // Large PDFs are often pilot logbooks (multi-page scans)
      return {
        success: true,
        classification: {
          detectedType: 'logbook' as const, // Assume logbook for large multi-page PDFs
          confidence: 0.5,
          suggestedName: `Logbook ${new Date().toISOString().split('T')[0]}`,
          estimatedEntryCount: 100, // Estimate for large file
          documentQuality: 'fair' as const,
          qualityNotes: [`Large file (${fileSizeMB}MB) - classification skipped, assumed logbook`],
          isHandwritten: true, // Likely handwritten if it's a scanned logbook
          summary: `Large document (${fileSizeMB}MB) - assumed pilot logbook based on size`,
        }
      };
    }

    const prompt = `You are an expert aviation document classifier. Analyze this document quickly and identify its type.

DOCUMENT TYPES (choose the most specific match):

PILOT-RELATED DOCUMENTS:
- pilot_logbook: Personal pilot flight logbook with dates, aircraft, times (SEL, MEL, PIC), landings, remarks
- medical: FAA medical certificate showing class, date, pilot name
- certificate: Pilot certificate/license (PPL, CPL, ATP, Sport Pilot)
- endorsement: Instructor endorsements for training (solo, checkride, etc.)
- checkout: Aircraft checkout form or proficiency check record

AIRCRAFT-RELATED DOCUMENTS:
- aircraft_logbook: Aircraft's own flight/journey logbook tracking hours on the airframe
- maintenance: Maintenance records with work descriptions, mechanic signatures
- inspection: Specific inspection records (annual, 100-hour, progressive)
- poh: Pilot Operating Handbook with V-speeds, performance, emergency procedures
- weight_balance: Weight & balance sheets or calculations
- insurance: Aircraft insurance documents
- registration: FAA aircraft registration (N-number documentation)
- ad_compliance: Airworthiness Directive compliance records
- service_bulletin: Service bulletin compliance documentation

OTHER:
- logbook: Generic logbook if you can't distinguish pilot vs aircraft
- other: Cannot determine or doesn't fit above categories
- unknown: Completely unrecognizable

CLASSIFICATION TIPS - VERY IMPORTANT:
- PILOT LOGBOOK: Look for TABULAR structure with multiple rows of flight entries. Key indicators:
  * Multiple columns with headers like: DATE, AIRCRAFT (tail numbers like N12345), FROM/TO (airport codes like KRHV, KLAX), TIME columns
  * Rows of flight entries with dates, often handwritten
  * Time columns may show decimal hours (1.5, 2.3) or hours:minutes
  * May be on standard Jeppesen, ASA, or generic logbook paper with pre-printed column headers
  * EVEN IF HANDWRITTEN OR SCANNED QUALITY - if it has flight date/aircraft/airport/time structure, it's a pilot_logbook
  * The presence of MULTIPLE DIFFERENT tail numbers (N-numbers) strongly indicates pilot logbook (not aircraft logbook)
- AIRCRAFT LOGBOOK: Tracks a SINGLE aircraft's airframe/engine hours. Has "Aircraft Log" title, ONE tail number throughout
- Look for pilot NAME on cover of pilot logbooks
- Maintenance records have mechanic names, A&P numbers, work performed descriptions
- When in doubt between pilot_logbook and other for a document with flight entries, choose pilot_logbook

Output ONLY valid JSON (no markdown):
{
  "detectedType": "pilot_logbook" | "aircraft_logbook" | "maintenance" | "inspection" | "poh" | "weight_balance" | "insurance" | "registration" | "medical" | "certificate" | "endorsement" | "checkout" | "ad_compliance" | "service_bulletin" | "logbook" | "other" | "unknown",
  "confidence": 0.0-1.0,
  "suggestedName": "Descriptive name based on content",
  "pilotName": "Full pilot name if visible (for pilot documents)",
  "aircraftTailNumbers": ["N12345", "N67890"],
  "dateRange": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"},
  "estimatedEntryCount": 50,
  "documentQuality": "excellent" | "good" | "fair" | "poor",
  "qualityNotes": ["Handwritten", "Some faded text", "Multi-page scan"],
  "isHandwritten": true/false,
  "pageCount": 10,
  "summary": "Brief 1-2 sentence description",
  "matchedPilotName": "Exact pilot name found (null if none)",
  "matchedAircraftTails": ["N12345"]
}`;

    const mimeType = fileType === 'pdf' ? 'application/pdf' : 'image/png';

    const response = await generateVisionCompletion({
      model: OPENROUTER_MODELS.FAST,
      userPrompt: prompt,
      imageBase64: fileBase64,
      mimeType,
    });

    let classification: FastDocumentClassification;
    try {
      classification = parseJsonResponse(response);
      // Normalize legacy types to new types
      if (classification.detectedType === 'logbook' && classification.pilotName) {
        classification.detectedType = 'pilot_logbook';
      }
    } catch (parseError) {
      console.error('[FastClassify] Failed to parse AI response:', response);
      // Return a fallback classification
      classification = {
        detectedType: 'unknown',
        confidence: 0.3,
        suggestedName: `Document_${Date.now()}`,
        estimatedEntryCount: 0,
        documentQuality: 'fair',
        qualityNotes: ['Could not fully analyze document'],
        isHandwritten: false,
        summary: 'Document type could not be determined',
        matchedPilotName: undefined,
        matchedAircraftTails: []
      };
    }

    const duration = Date.now() - startTime;
    console.log(`[FastClassify] Completed in ${duration}ms - Type: ${classification.detectedType}, Confidence: ${classification.confidence}`);

    return {
      success: true,
      classification
    };

  } catch (error) {
    console.error('[FastClassify] Error:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}
