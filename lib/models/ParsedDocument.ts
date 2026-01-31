import mongoose, { Schema, Document, Model } from 'mongoose';

export type ProgressStep = 'pending' | 'queued' | 'uploading' | 'analyzing' | 'processing' | 'extracting' | 'complete' | 'failed';
export type DocumentQuality = 'excellent' | 'good' | 'fair' | 'poor';

// Analysis result from AI classification
export interface DocumentAnalysis {
    detectedType: 'logbook' | 'maintenance' | 'poh' | 'unknown';
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
}

export interface IParsedDocument extends Document {
    filename: string;
    originalFilename: string;
    documentType: 'logbook' | 'maintenance' | 'poh' | 'other';
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

const ParsedDocumentSchema = new Schema<IParsedDocument>({
    filename: { type: String, required: true },
    originalFilename: { type: String },
    documentType: {
        type: String,
        enum: ['logbook', 'maintenance', 'poh', 'other'],
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
        detectedType: { type: String, enum: ['logbook', 'maintenance', 'poh', 'unknown'] },
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
        summary: { type: String }
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
