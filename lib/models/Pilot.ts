import mongoose, { Schema, Model } from 'mongoose';

export interface ICertificate {
  type: 'Student' | 'Recreational' | 'PPL' | 'CPL' | 'ATP' | 'Sport';
  instrumentRated: boolean;
  multiEngineRated: boolean;
  // Additional ratings and instructor privileges
  cfi?: boolean;            // Certified Flight Instructor (14 CFR 61.183)
  cfii?: boolean;           // CFI - Instrument (14 CFR 61.183)
  mei?: boolean;            // Multi-Engine Instructor
  groundInstructor?: boolean;
  remotePilot?: boolean;    // Part 107 sUAS rating
  // Category/class ratings held
  categoryClassRatings?: string[]; // e.g., ['ASEL', 'AMEL', 'Rotorcraft-Helicopter']
  // Type ratings (e.g., for large/turbojet aircraft)
  typeRatings?: string[];   // e.g., ['CE-525', 'B737']
  certificateNumber?: string; // FAA certificate number
  dateIssued?: Date;
}

export interface IEndorsement {
  type:
    | 'High Performance'    // 14 CFR 61.31(f) - >200 HP
    | 'Complex'             // 14 CFR 61.31(e) - retractable gear, flaps, controllable prop
    | 'Tailwheel'           // 14 CFR 61.31(i)
    | 'High Altitude'       // 14 CFR 61.31(g) - pressurized >25,000 ft
    | 'Solo'                // 14 CFR 61.87 - student solo endorsement
    | 'Solo Cross-Country'  // 14 CFR 61.93
    | 'Checkride'           // 14 CFR 61.39 - practical test endorsement
    | 'Knowledge Test'      // 14 CFR 61.35
    | 'Class B'             // 14 CFR 61.95 - Class B airspace (student)
    | 'Class C'             // Class C airspace (student)
    | 'Night';              // Sport pilot night endorsement
  date: Date;
  instructor: string;
  regulatoryReference?: string; // e.g., "14 CFR 61.31(f)"
  expirationDate?: Date;        // Some endorsements may expire
}

export interface IExperience {
  totalHours: number;
  picHours: number;
  nightHours: number;
  ifrHours: number;
  crossCountryHours: number;
  last90DaysHours: number;
  last30DaysHours: number;
  // Landing currency tracking (14 CFR 61.57)
  landingCurrency?: {
    dayLandingsLast90Days: number;      // 14 CFR 61.57(a) - need 3 for day pax
    nightLandingsLast90Days: number;    // 14 CFR 61.57(b) - need 3 full-stop for night pax
    lastDayLandingDate?: Date;
    lastNightLandingDate?: Date;
    tailwheelLandingsLast90Days?: number; // 14 CFR 61.57(a)(1) - must be full-stop in tailwheel
  };
  // IFR currency tracking (14 CFR 61.57(c))
  ifrCurrency?: {
    approachesLast6Months: number;       // Need 6 approaches
    holdingLast6Months: boolean;         // Must have holding
    interceptingTrackingLast6Months: boolean; // Must have intercepting/tracking
    lastIFRDate?: Date;
    ipcDate?: Date;                      // Instrument Proficiency Check date
  };
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

export interface IWeatherExperience {
  totalFlights: number;
  flightsWithWeather: number;
  vfr: number;
  mvfr: number;
  ifr: number;
  lifr: number;
  lastUpdated: Date;
}

export interface IPilot {
  _id: mongoose.Types.ObjectId;
  userId: string;
  name: string;
  email: string;
  certificates: ICertificate;
  endorsements: IEndorsement[];
  experience: IExperience;
  flightEntries: IFlightEntry[];
  linkedDocuments: mongoose.Types.ObjectId[];
  medicalClass?: '1st' | '2nd' | '3rd' | 'BasicMed'; // 14 CFR 61.23
  medicalExpiration: Date;
  medicalDateOfBirth?: Date;  // Needed for age-based duration calculations per 14 CFR 61.23(d)
  basicMed?: {
    enabled: boolean;
    lastPhysicalExam?: Date;    // Must be completed every 48 months
    lastOnlineCourse?: Date;    // Aeromedical factors course every 24 months
    checklist?: string;          // CMEC (Comprehensive Medical Examination Checklist)
  };
  flightReviewExpiration: Date;
  wingsPhaseCompleted?: {        // WINGS program can substitute for flight review per 14 CFR 61.56
    phase: number;
    completedDate: Date;
  };
  weatherExperience?: IWeatherExperience;
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
    enum: ['Student', 'Recreational', 'PPL', 'CPL', 'ATP', 'Sport'],
    required: true,
  },
  instrumentRated: { type: Boolean, default: false },
  multiEngineRated: { type: Boolean, default: false },
  cfi: { type: Boolean, default: false },
  cfii: { type: Boolean, default: false },
  mei: { type: Boolean, default: false },
  groundInstructor: { type: Boolean, default: false },
  remotePilot: { type: Boolean, default: false },
  categoryClassRatings: [{ type: String }],
  typeRatings: [{ type: String }],
  certificateNumber: { type: String },
  dateIssued: { type: Date },
});

const EndorsementSchema = new Schema<IEndorsement>({
  type: {
    type: String,
    enum: [
      'High Performance', 'Complex', 'Tailwheel', 'High Altitude',
      'Solo', 'Solo Cross-Country', 'Checkride', 'Knowledge Test',
      'Class B', 'Class C', 'Night',
    ],
    required: true,
  },
  date: { type: Date, required: true },
  instructor: { type: String, required: true },
  regulatoryReference: { type: String },
  expirationDate: { type: Date },
});

const ExperienceSchema = new Schema<IExperience>({
  totalHours: { type: Number, required: true, default: 0 },
  picHours: { type: Number, required: true, default: 0 },
  nightHours: { type: Number, default: 0 },
  ifrHours: { type: Number, default: 0 },
  crossCountryHours: { type: Number, default: 0 },
  last90DaysHours: { type: Number, default: 0 },
  last30DaysHours: { type: Number, default: 0 },
  landingCurrency: {
    dayLandingsLast90Days: { type: Number, default: 0 },
    nightLandingsLast90Days: { type: Number, default: 0 },
    lastDayLandingDate: { type: Date },
    lastNightLandingDate: { type: Date },
    tailwheelLandingsLast90Days: { type: Number, default: 0 },
  },
  ifrCurrency: {
    approachesLast6Months: { type: Number, default: 0 },
    holdingLast6Months: { type: Boolean, default: false },
    interceptingTrackingLast6Months: { type: Boolean, default: false },
    lastIFRDate: { type: Date },
    ipcDate: { type: Date },
  },
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
    userId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
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
    medicalClass: {
      type: String,
      enum: ['1st', '2nd', '3rd', 'BasicMed'],
    },
    medicalExpiration: {
      type: Date,
      required: true,
    },
    medicalDateOfBirth: {
      type: Date,
    },
    basicMed: {
      enabled: { type: Boolean, default: false },
      lastPhysicalExam: { type: Date },
      lastOnlineCourse: { type: Date },
      checklist: { type: String },
    },
    flightReviewExpiration: {
      type: Date,
      required: true,
    },
    wingsPhaseCompleted: {
      phase: { type: Number },
      completedDate: { type: Date },
    },
    weatherExperience: {
      totalFlights: { type: Number, default: 0 },
      flightsWithWeather: { type: Number, default: 0 },
      vfr: { type: Number, default: 0 },
      mvfr: { type: Number, default: 0 },
      ifr: { type: Number, default: 0 },
      lifr: { type: Number, default: 0 },
      lastUpdated: { type: Date },
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
