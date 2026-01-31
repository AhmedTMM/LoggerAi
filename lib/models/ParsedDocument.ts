import mongoose, { Schema, Document, Model } from 'mongoose';

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
    // New fields for auto-attachment
    suggestedPilotId?: string;      // AI-suggested pilot to attach to
    suggestedAircraftId?: string;   // AI-suggested aircraft to attach to
    attachmentConfidence?: number;   // Confidence in the attachment suggestion (0-1)
    attachmentReason?: string;       // Why the AI suggests this attachment
}

export interface IParsedDocument extends Document {
    filename: string;
    originalFilename: string;
    documentType: DocumentType;
    fileType: 'pdf' | 'image';
    uploadedAt: Date;
    parsedAt?: Date;
    status: 'pending' | 'analyzing' | 'parsing' | 'completed' | 'failed';

    // Progress tracking
    progress: number;           // 0-100 percentage
    progressStep: ProgressStep; // Current step in the process
    retryCount: number;         // Number of retry attempts

    // Document analysis from AI classification
    analysis?: DocumentAnalysis;

    // File storage path (for raw file on disk)
    filePath?: string;
    fileSize?: number;

    // The raw Reducto output
    rawOutput?: Record<string, any>;

    // Extracted entries
    entries?: Array<Record<string, any>>;

    // Summary stats
    summary?: {
        totalEntries: number;
        totalHours?: number;
        dateRange?: { from: string; to: string };
    };

    // Link to aircraft (optional)
    aircraft?: mongoose.Types.ObjectId;

    // Link to pilot (optional)
    pilot?: mongoose.Types.ObjectId;

    // Error message if failed
    error?: string;

    // Original file stored as base64 (for re-parsing if needed) - deprecated, use filePath
    fileBase64?: string;
}

// All valid document types for schema validation
const DOCUMENT_TYPE_VALUES: DocumentType[] = [
    'pilot_logbook', 'aircraft_logbook', 'maintenance', 'inspection',
    'poh', 'weight_balance', 'insurance', 'registration',
    'medical', 'certificate', 'endorsement', 'checkout',
    'ad_compliance', 'service_bulletin', 'logbook', 'other'
];

const ParsedDocumentSchema = new Schema<IParsedDocument>({
    filename: { type: String, required: true },
    originalFilename: { type: String },
    documentType: {
        type: String,
        enum: DOCUMENT_TYPE_VALUES,
        required: true
    },
    fileType: { type: String, enum: ['pdf', 'image'], required: true },
    uploadedAt: { type: Date, default: Date.now },
    parsedAt: { type: Date },
    status: {
        type: String,
        enum: ['pending', 'analyzing', 'parsing', 'completed', 'failed'],
        default: 'pending'
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    progressStep: {
        type: String,
        enum: ['pending', 'queued', 'uploading', 'analyzing', 'processing', 'extracting', 'complete', 'failed'],
        default: 'pending'
    },
    retryCount: { type: Number, default: 0 },
    // Document analysis from AI classification
    analysis: {
        detectedType: { type: String, enum: [...DOCUMENT_TYPE_VALUES, 'unknown'] },
        confidence: { type: Number },
        suggestedName: { type: String },
        pilotName: { type: String },
        aircraftTailNumbers: [{ type: String }],
        dateRange: {
            from: { type: String },
            to: { type: String }
        },
        estimatedEntryCount: { type: Number },
        documentQuality: { type: String, enum: ['excellent', 'good', 'fair', 'poor'] },
        qualityNotes: [{ type: String }],
        isHandwritten: { type: Boolean },
        pageCount: { type: Number },
        summary: { type: String },
        // Auto-attachment suggestions
        suggestedPilotId: { type: Schema.Types.ObjectId, ref: 'Pilot' },
        suggestedAircraftId: { type: Schema.Types.ObjectId, ref: 'Aircraft' },
        attachmentConfidence: { type: Number },
        attachmentReason: { type: String }
    },
    // File storage
    filePath: { type: String },
    fileSize: { type: Number },
    rawOutput: { type: Schema.Types.Mixed },
    entries: [{ type: Schema.Types.Mixed }],
    summary: {
        totalEntries: { type: Number },
        totalHours: { type: Number },
        dateRange: {
            from: { type: String },
            to: { type: String }
        }
    },
    aircraft: { type: Schema.Types.ObjectId, ref: 'Aircraft' },
    pilot: { type: Schema.Types.ObjectId, ref: 'Pilot' },
    error: { type: String },
    fileBase64: { type: String }
}, {
    timestamps: true
});

// Index for quick lookups
ParsedDocumentSchema.index({ aircraft: 1, documentType: 1 });
ParsedDocumentSchema.index({ pilot: 1, documentType: 1 });
ParsedDocumentSchema.index({ status: 1 });

const ParsedDocument: Model<IParsedDocument> =
    mongoose.models.ParsedDocument || mongoose.model<IParsedDocument>('ParsedDocument', ParsedDocumentSchema);

export default ParsedDocument;
