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
  hundredHour?: Date;
}

export interface IMELItem {
  item: string;
  required: boolean;
  remarks?: string;
}

export interface IAircraft {
  _id: mongoose.Types.ObjectId;
  tailNumber: string;
  model: string;
  serial: string;
  manufacturer: string;
  year: number;
  imageUrl?: string;
  pohUrl?: string;
  operatingLimits?: {
    vSpeeds: {
      vso: number;
      vs1: number;
      vr: number;
      vx: number;
      vy: number;
      vfe: number;
      va: number;
      vno: number;
      vne: number;
    };
    weights: {
      maxGross: number;
      empty: number;
      usefulLoad: number;
      fuelCapacity: number;
    };
  };
  maintenanceDates: {
    annual: Date;
    transponder: Date;
    staticSystem: Date;
    hundredHour?: Date;
  };
  airworthinessStatus?: IAirworthinessStatus;
  mel?: IMELItem[];
  currentHours: {
    hobbs: number;
    tach: number;
  };
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
  linkedDocuments?: mongoose.Types.ObjectId[];
  logs: ILogEntry[];
  logbooks?: {
    engine: ILogEntry[];
    airframe: ILogEntry[];
    propeller: ILogEntry[];
    avionics: ILogEntry[];
  };
  owner?: {
    name: string;
    email: string;
  };
  scrapedData?: {
    lastScraped: Date;
    source: string;
    rawData?: any;
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
    tailNumber: {
      type: String,
      required: true,
      unique: true,
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
      },
      weights: {
        maxGross: { type: Number },
        empty: { type: Number },
        usefulLoad: { type: Number },
        fuelCapacity: { type: Number },
      },
    },
    maintenanceDates: {
      annual: { type: Date, required: true },
      transponder: { type: Date, required: true },
      staticSystem: { type: Date, required: true },
      hundredHour: { type: Date },
    },
    airworthinessStatus: {
      annual: { type: Date },
      transponder: { type: Date },
      altimeter: { type: Date },
      staticSystem: { type: Date },
      vor: { type: Date },
      elt: { type: Date },
      hundredHour: { type: Date },
    },
    mel: [MELItemSchema],
    currentHours: {
      hobbs: { type: Number, required: true, default: 0 },
      tach: { type: Number, required: true, default: 0 },
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
