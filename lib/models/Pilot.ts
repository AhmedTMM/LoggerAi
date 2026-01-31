import mongoose, { Schema, Model } from 'mongoose';

export interface ICertificate {
  type: 'Student' | 'PPL' | 'CPL' | 'ATP' | 'Sport';
  instrumentRated: boolean;
  multiEngineRated: boolean;
}

export interface IEndorsement {
  type: 'High Performance' | 'Complex' | 'Tailwheel' | 'High Altitude';
  date: Date;
  instructor: string;
}

export interface IExperience {
  totalHours: number;
  picHours: number;
  nightHours: number;
  ifrHours: number;
  crossCountryHours: number;
  last90DaysHours: number;
  last30DaysHours: number;
}

export interface IFlightEntry {
  date: string;
  aircraftIdent: string;
  aircraftType?: string;
  from: string;
  to: string;
  route?: string;
  totalTime: number;
  pic?: number;
  sic?: number;
  solo?: number;
  dualReceived?: number;
  dualGiven?: number;
  crossCountry?: number;
  night?: number;
  actualInstrument?: number;
  simulatedInstrument?: number;
  sel?: number;
  mel?: number;
  landingsDay?: number;
  landingsNight?: number;
  landingsTotal?: number;
  remarks?: string;
}

export interface IPilot {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  certificates: ICertificate;
  endorsements: IEndorsement[];
  experience: IExperience;
  flightEntries: IFlightEntry[];
  linkedDocuments: mongoose.Types.ObjectId[];
  medicalExpiration: Date;
  flightReviewExpiration: Date;
  safetyAnalysis?: {
    lastAnalyzed: Date;
    score: number;
    findings: {
      category: string;
      riskLevel: 'low' | 'medium' | 'high';
      message: string;
    }[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const CertificateSchema = new Schema<ICertificate>({
  type: {
    type: String,
    enum: ['Student', 'PPL', 'CPL', 'ATP', 'Sport'],
    required: true,
  },
  instrumentRated: { type: Boolean, default: false },
  multiEngineRated: { type: Boolean, default: false },
});

const EndorsementSchema = new Schema<IEndorsement>({
  type: {
    type: String,
    enum: ['High Performance', 'Complex', 'Tailwheel', 'High Altitude'],
    required: true,
  },
  date: { type: Date, required: true },
  instructor: { type: String, required: true },
});

const ExperienceSchema = new Schema<IExperience>({
  totalHours: { type: Number, required: true, default: 0 },
  picHours: { type: Number, required: true, default: 0 },
  nightHours: { type: Number, default: 0 },
  ifrHours: { type: Number, default: 0 },
  crossCountryHours: { type: Number, default: 0 },
  last90DaysHours: { type: Number, default: 0 },
  last30DaysHours: { type: Number, default: 0 },
});

const FlightEntrySchema = new Schema<IFlightEntry>({
  date: { type: String, required: true },
  aircraftIdent: { type: String, required: true },
  aircraftType: String,
  from: { type: String, required: true },
  to: { type: String, required: true },
  route: String,
  totalTime: { type: Number, required: true },
  pic: Number,
  sic: Number,
  solo: Number,
  dualReceived: Number,
  dualGiven: Number,
  crossCountry: Number,
  night: Number,
  actualInstrument: Number,
  simulatedInstrument: Number,
  sel: Number,
  mel: Number,
  landingsDay: Number,
  landingsNight: Number,
  landingsTotal: Number,
  remarks: String,
}, { _id: false });

const PilotSchema = new Schema<IPilot>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    certificates: {
      type: CertificateSchema,
      required: true,
    },
    endorsements: [EndorsementSchema],
    experience: {
      type: ExperienceSchema,
      required: true,
    },
    flightEntries: {
      type: [FlightEntrySchema],
      default: [],
    },
    linkedDocuments: [{
      type: Schema.Types.ObjectId,
      ref: 'ParsedDocument',
    }],
    medicalExpiration: {
      type: Date,
      required: true,
    },
    flightReviewExpiration: {
      type: Date,
      required: true,
    },
    safetyAnalysis: {
      lastAnalyzed: { type: Date },
      score: { type: Number },
      findings: [{
        category: { type: String },
        riskLevel: { type: String, enum: ['low', 'medium', 'high'] },
        message: { type: String }
      }]
    },
  },
  {
    timestamps: true,
  }
);

const Pilot: Model<IPilot> = mongoose.models.Pilot || mongoose.model<IPilot>('Pilot', PilotSchema);

export default Pilot;
