// Document types and metadata - safe for client-side imports
// This file contains no server-side dependencies

export type ProgressStep = 'pending' | 'queued' | 'uploading' | 'analyzing' | 'processing' | 'extracting' | 'complete' | 'failed';
export type DocumentQuality = 'excellent' | 'good' | 'fair' | 'poor';

// Expanded document types for better categorization
export type DocumentType =
    | 'pilot_logbook'      // Pilot's personal flight logbook
    | 'aircraft_logbook'   // Aircraft journey/flight logbook (tied to specific tail number)
    | 'maintenance'        // General maintenance records
    | 'inspection'         // Annual, 100-hour, or other specific inspections
    | 'poh'               // Pilot Operating Handbook
    | 'weight_balance'    // Weight & balance records
    | 'insurance'         // Aircraft insurance documents
    | 'registration'      // Aircraft registration (N-number docs)
    | 'medical'           // Pilot medical certificate
    | 'certificate'       // Pilot certificates/licenses (PPL, CPL, ATP)
    | 'endorsement'       // Instructor endorsements
    | 'checkout'          // Aircraft checkout/checkout forms
    | 'ad_compliance'     // Airworthiness Directive compliance records
    | 'service_bulletin'  // Service bulletin compliance
    | 'logbook'           // Legacy: generic logbook (for backwards compat)
    | 'other';            // Unknown/other document type

// Document type metadata for UI display
export const DOCUMENT_TYPE_META: Record<DocumentType, {
    label: string;
    category: 'pilot' | 'aircraft' | 'general';
    color: string;
    description: string;
}> = {
    pilot_logbook: { label: 'Pilot Logbook', category: 'pilot', color: 'blue', description: 'Personal flight records' },
    aircraft_logbook: { label: 'Aircraft Logbook', category: 'aircraft', color: 'indigo', description: 'Aircraft flight records' },
    maintenance: { label: 'Maintenance', category: 'aircraft', color: 'amber', description: 'Maintenance records' },
    inspection: { label: 'Inspection', category: 'aircraft', color: 'orange', description: 'Inspection records' },
    poh: { label: 'POH', category: 'aircraft', color: 'purple', description: 'Pilot Operating Handbook' },
    weight_balance: { label: 'Weight & Balance', category: 'aircraft', color: 'cyan', description: 'Weight and balance data' },
    insurance: { label: 'Insurance', category: 'aircraft', color: 'slate', description: 'Insurance documents' },
    registration: { label: 'Registration', category: 'aircraft', color: 'emerald', description: 'Aircraft registration' },
    medical: { label: 'Medical', category: 'pilot', color: 'rose', description: 'Medical certificate' },
    certificate: { label: 'Certificate', category: 'pilot', color: 'violet', description: 'Pilot certificates' },
    endorsement: { label: 'Endorsement', category: 'pilot', color: 'teal', description: 'Training endorsements' },
    checkout: { label: 'Checkout', category: 'pilot', color: 'lime', description: 'Aircraft checkout forms' },
    ad_compliance: { label: 'AD Compliance', category: 'aircraft', color: 'red', description: 'Airworthiness Directives' },
    service_bulletin: { label: 'Service Bulletin', category: 'aircraft', color: 'yellow', description: 'Service bulletins' },
    logbook: { label: 'Logbook', category: 'general', color: 'blue', description: 'Generic logbook' },
    other: { label: 'Other', category: 'general', color: 'gray', description: 'Other documents' }
};

// Detected type from AI (more specific than storage type)
export type DetectedDocumentType = DocumentType | 'unknown';

// Analysis result from AI classification
export interface DocumentAnalysis {
    detectedType: DetectedDocumentType;
    confidence: number;
    suggestedName: string;
    pilotName?: string;
    aircraftTailNumbers?: string[];
    dateRange?: { from: string; to: string };
    estimatedEntryCount: number;
    documentQuality: DocumentQuality;
    qualityNotes: string[];
    isHandwritten: boolean;
    pageCount?: number;
    summary: string;
    // Fields for auto-attachment
    suggestedPilotId?: string;
    suggestedAircraftId?: string;
    attachmentConfidence?: number;
    attachmentReason?: string;
}
