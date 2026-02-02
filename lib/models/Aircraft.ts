import mongoose, { Schema, Model } from 'mongoose';

export type LogbookCategory = 'engine' | 'airframe' | 'propeller' | 'avionics';

export interface ILogEntry {
  date: Date;
  description: string;
  hobbsTime: number;
  tachTime: number;
  mechanic?: string;
  rawText?: string;
  category?: LogbookCategory;
}

export interface IAirworthinessStatus {
  annual?: Date;
  transponder?: Date;
  altimeter?: Date;
  staticSystem?: Date;
  vor?: Date;
  elt?: Date;
  eltBatteryExpiration?: Date;
  hundredHour?: Date;
  // For-hire tracking
  isForHire?: boolean;
  // Progressive inspection tracking
  progressiveInspection?: {
    enabled: boolean;
    lastPhase?: number;
    phaseCompleteDate?: Date;
  };
}

// POH Scraped Data Structure
export interface IPOHData {
  source: 'faa_registry' | 'manufacturer' | 'manual_entry' | 'scraped';
  scrapedAt?: Date;
  // Performance data
  performance?: {
    takeoffDistanceGround?: number; // feet
    takeoffDistanceOver50ft?: number;
    landingDistanceGround?: number;
    landingDistanceOver50ft?: number;
    rateOfClimb?: number; // fpm
    serviceCeiling?: number; // feet
    range?: number; // nm
    endurance?: number; // hours
    bestGlide?: number; // KIAS
  };
  // Powerplant
  powerplant?: {
    engineMake: string;
    engineModel: string;
    horsepower: number;
    propellerMake?: string;
    propellerModel?: string;
    fuelType: string;
    oilCapacity?: number; // quarts
    fuelBurn?: number; // gph at cruise
  };
  // Emergency procedures summary
  emergencyProcedures?: {
    engineFailureTakeoff?: string;
    engineFailureCruise?: string;
    fireInFlight?: string;
    electricalFailure?: string;
  };
  // Raw scraped content
  rawContent?: string;
}

// MEL/KOEL Configuration
export interface IMELConfig {
  requiresMEL: boolean;
  melDocumentId?: string; // Reference to uploaded MEL document
  koelApplicable: boolean;
  koelDocumentId?: string;
  uploadedAt?: Date;
  items: IMELItem[];
}

export interface IMELItem {
  item: string;
  required: boolean;
  remarks?: string;
}

export interface IAircraft {
  _id: mongoose.Types.ObjectId;
  userId: string;
  tailNumber: string;
  model: string;
  serial: string;
  manufacturer: string;
  year: number;
  imageUrl?: string;
  pohUrl?: string;

  // Operating Limits (V-speeds and weights)
  operatingLimits?: {
    vSpeeds: {
      vso: number;   // Stall speed landing config
      vs1: number;   // Stall speed clean
      vr: number;    // Rotation speed
      vx: number;    // Best angle of climb
      vy: number;    // Best rate of climb
      vfe: number;   // Max flap extended
      va: number;    // Maneuvering speed
      vno: number;   // Max structural cruise
      vne: number;   // Never exceed
      vglide?: number; // Best glide
    };
    weights: {
      maxGross: number;
      empty: number;
      usefulLoad: number;
      fuelCapacity: number;
      maxRamp?: number;
      maxLanding?: number;
    };
  };

  // Maintenance Dates (legacy, kept for compatibility)
  maintenanceDates: {
    annual: Date;
    transponder: Date;
    staticSystem: Date;
    hundredHour?: Date;
  };

  // Full Airworthiness Status (AV1ONICS tracking)
  airworthinessStatus?: IAirworthinessStatus;

  // MEL/KOEL Configuration
  mel?: IMELItem[];
  melConfig?: IMELConfig;

  // POH Scraped Data
  pohData?: IPOHData;

  // Current Aircraft Hours
  currentHours: {
    hobbs: number;
    tach: number;
    engine?: number;      // Engine time since new/overhaul
    propeller?: number;   // Prop time since overhaul
  };

  // AI Safety Analysis
  safetyAnalysis?: {
    lastAnalyzed: Date;
    score: number;
    findings: {
      component: string;
      status: 'ok' | 'warning' | 'critical';
      message: string;
      lastMentioned?: Date;
    }[];
  };

  // Linked Documents
  linkedDocuments?: mongoose.Types.ObjectId[];

  // General Logs (legacy)
  logs: ILogEntry[];

  // Category-specific Logbooks
  logbooks?: {
    engine: ILogEntry[];
    airframe: ILogEntry[];
    propeller: ILogEntry[];
    avionics: ILogEntry[];
  };

  // Owner Information
  owner?: {
    name: string;
    email: string;
  };

  // FAA Registry / Scraped Data
  scrapedData?: {
    lastScraped: Date;
    source: string;
    rawData?: any;
    // FAA Registry specific fields
    faaRegistration?: {
      registrationNumber: string;
      serialNumber: string;
      mfrMdlCode: string;
      engMfrMdl: string;
      yearMfr: number;
      typeRegistrant: string;
      name: string;
      street: string;
      city: string;
      state: string;
      zipCode: string;
      region: string;
      county: string;
      country: string;
      lastActionDate: string;
      certIssueDate: string;
      certification: string;
      typeAircraft: string;
      typeEngine: string;
      statusCode: string;
      modeSCode: string;
      fractOwner: string;
      airWorthDate: string;
      expirationDate: string;
    };
  };

  createdAt: Date;
  updatedAt: Date;
}

const LogEntrySchema = new Schema<ILogEntry>({
  date: { type: Date, required: true },
  description: { type: String, required: true },
  hobbsTime: { type: Number, required: true },
  tachTime: { type: Number, required: true },
  mechanic: { type: String },
  rawText: { type: String },
  category: { type: String, enum: ['engine', 'airframe', 'propeller', 'avionics'] },
});

const MELItemSchema = new Schema({
  item: { type: String, required: true },
  required: { type: Boolean, default: true },
  remarks: { type: String },
}, { _id: false });

const AircraftSchema = new Schema<IAircraft>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    tailNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    model: {
      type: String,
      required: true,
      trim: true,
    },
    serial: {
      type: String,
      required: true,
      trim: true,
    },
    manufacturer: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    year: {
      type: Number,
      required: true,
    },
    imageUrl: {
      type: String,
    },
    pohUrl: {
      type: String,
    },
    operatingLimits: {
      vSpeeds: {
        vso: { type: Number },
        vs1: { type: Number },
        vr: { type: Number },
        vx: { type: Number },
        vy: { type: Number },
        vfe: { type: Number },
        va: { type: Number },
        vno: { type: Number },
        vne: { type: Number },
        vglide: { type: Number },
      },
      weights: {
        maxGross: { type: Number },
        empty: { type: Number },
        usefulLoad: { type: Number },
        fuelCapacity: { type: Number },
        maxRamp: { type: Number },
        maxLanding: { type: Number },
      },
    },
    maintenanceDates: {
      annual: { type: Date, required: true },
      transponder: { type: Date, required: true },
      staticSystem: { type: Date, required: true },
      hundredHour: { type: Date },
    },
    // Full Airworthiness Status (AV1ONICS tracking)
    airworthinessStatus: {
      annual: { type: Date },
      transponder: { type: Date },
      altimeter: { type: Date },
      staticSystem: { type: Date },
      vor: { type: Date },
      elt: { type: Date },
      eltBatteryExpiration: { type: Date },
      hundredHour: { type: Date },
      isForHire: { type: Boolean, default: false },
      progressiveInspection: {
        enabled: { type: Boolean, default: false },
        lastPhase: { type: Number },
        phaseCompleteDate: { type: Date },
      },
    },
    mel: [MELItemSchema],
    // MEL/KOEL Configuration
    melConfig: {
      requiresMEL: { type: Boolean, default: false },
      melDocumentId: { type: String },
      koelApplicable: { type: Boolean, default: false },
      koelDocumentId: { type: String },
      uploadedAt: { type: Date },
      items: [MELItemSchema],
    },
    // POH Scraped Data
    pohData: {
      source: { type: String, enum: ['faa_registry', 'manufacturer', 'manual_entry', 'scraped'] },
      scrapedAt: { type: Date },
      performance: {
        takeoffDistanceGround: { type: Number },
        takeoffDistanceOver50ft: { type: Number },
        landingDistanceGround: { type: Number },
        landingDistanceOver50ft: { type: Number },
        rateOfClimb: { type: Number },
        serviceCeiling: { type: Number },
        range: { type: Number },
        endurance: { type: Number },
        bestGlide: { type: Number },
      },
      powerplant: {
        engineMake: { type: String },
        engineModel: { type: String },
        horsepower: { type: Number },
        propellerMake: { type: String },
        propellerModel: { type: String },
        fuelType: { type: String },
        oilCapacity: { type: Number },
        fuelBurn: { type: Number },
      },
      emergencyProcedures: {
        engineFailureTakeoff: { type: String },
        engineFailureCruise: { type: String },
        fireInFlight: { type: String },
        electricalFailure: { type: String },
      },
      rawContent: { type: String },
    },
    currentHours: {
      hobbs: { type: Number, required: true, default: 0 },
      tach: { type: Number, required: true, default: 0 },
      engine: { type: Number },
      propeller: { type: Number },
    },
    safetyAnalysis: {
      lastAnalyzed: { type: Date },
      score: { type: Number },
      findings: [{
        component: { type: String },
        status: { type: String, enum: ['ok', 'warning', 'critical'] },
        message: { type: String },
        lastMentioned: { type: Date }
      }]
    },
    linkedDocuments: [{ type: Schema.Types.ObjectId, ref: 'ParsedDocument' }],
    logs: [LogEntrySchema],
    logbooks: {
      engine: [LogEntrySchema],
      airframe: [LogEntrySchema],
      propeller: [LogEntrySchema],
      avionics: [LogEntrySchema],
    },
    owner: {
      name: { type: String },
      email: { type: String },
    },
    scrapedData: {
      lastScraped: { type: Date },
      source: { type: String },
      rawData: { type: Schema.Types.Mixed },
      faaRegistration: {
        registrationNumber: { type: String },
        serialNumber: { type: String },
        mfrMdlCode: { type: String },
        engMfrMdl: { type: String },
        yearMfr: { type: Number },
        typeRegistrant: { type: String },
        name: { type: String },
        street: { type: String },
        city: { type: String },
        state: { type: String },
        zipCode: { type: String },
        region: { type: String },
        county: { type: String },
        country: { type: String },
        lastActionDate: { type: String },
        certIssueDate: { type: String },
        certification: { type: String },
        typeAircraft: { type: String },
        typeEngine: { type: String },
        statusCode: { type: String },
        modeSCode: { type: String },
        fractOwner: { type: String },
        airWorthDate: { type: String },
        expirationDate: { type: String },
      },
    },
  },
  {
    timestamps: true,
  }
);

// Prevent model recompilation in Next.js dev mode
// FORCE RECOMPILE in dev to ensure schema updates (like operatingLimits) are picked up
if (process.env.NODE_ENV === 'development' && mongoose.models.Aircraft) {
  delete mongoose.models.Aircraft;
}
const Aircraft: Model<IAircraft> = mongoose.models.Aircraft || mongoose.model<IAircraft>('Aircraft', AircraftSchema);

export default Aircraft;
