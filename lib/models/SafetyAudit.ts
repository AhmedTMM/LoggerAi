import mongoose, { Schema, Model, Types } from 'mongoose';

// Safety Audit Result Types
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type AuditStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

// Pilot Safety Finding
export interface IPilotSafetyFinding {
  category: string;
  riskLevel: RiskLevel;
  message: string;
  recommendation?: string;
  regulatoryReference?: string; // FAR reference
}

// Aircraft Safety Finding
export interface IAircraftSafetyFinding {
  component: string;
  status: 'ok' | 'warning' | 'critical';
  message: string;
  lastInspectionDate?: Date;
  dueDate?: Date;
  regulatoryReference?: string;
}

// Combined Risk Scenario
export interface IRiskScenario {
  title: string;
  probability: number; // 0-100
  severity: RiskLevel;
  description: string;
  mitigations: string[];
  affectedSystems: string[];
}

// Pilot Safety Audit
export interface IPilotSafetyAudit {
  pilotId: Types.ObjectId;
  analyzedAt: Date;
  overallScore: number; // 1-100, higher is safer
  riskLevel: RiskLevel;
  currencyStatus: 'current' | 'expiring' | 'expired';
  experienceLevel: 'student' | 'low_time' | 'experienced' | 'professional';
  findings: IPilotSafetyFinding[];
  qualifications: {
    certificateType: string;   // 14 CFR 61.5 certificate type
    medicalClass?: string;     // 14 CFR 61.23 medical class
    instrumentRated: boolean;
    multiEngineRated: boolean;
    cfi?: boolean;             // 14 CFR 61.183
    cfii?: boolean;
    endorsements: string[];
    typeRatings?: string[];
    categoryClassRatings?: string[];
  };
  recency: {
    totalHours: number;
    last30DaysHours: number;
    last90DaysHours: number;
    nightHours: number;
    ifrHours: number;
  };
  expirations: {
    medical: Date;
    flightReview: Date;
  };
  aiAnalysis?: {
    model: string;
    prompt: string;
    rawResponse?: string;
    confidence: number;
  };
}

// Aircraft Maintenance Audit (AV1ONICS)
export interface IAircraftMaintenanceAudit {
  aircraftId: Types.ObjectId;
  analyzedAt: Date;
  overallScore: number; // 1-100, higher is safer
  airworthinessStatus: 'airworthy' | 'conditional' | 'grounded';
  findings: IAircraftSafetyFinding[];
  inspections: {
    annual: { lastDate: Date; dueDate: Date; status: 'current' | 'due_soon' | 'overdue' };
    vor: { lastDate?: Date; dueDate?: Date; status: 'current' | 'due_soon' | 'overdue' | 'na' };
    hundredHour: { lastDate?: Date; dueDate?: Date; status: 'current' | 'due_soon' | 'overdue' | 'na' };
    altimeter: { lastDate: Date; dueDate: Date; status: 'current' | 'due_soon' | 'overdue' };
    transponder: { lastDate: Date; dueDate: Date; status: 'current' | 'due_soon' | 'overdue' };
    elt: { lastDate?: Date; dueDate?: Date; batteryExpiration?: Date; status: 'current' | 'due_soon' | 'overdue' | 'na' };
    staticSystem: { lastDate: Date; dueDate: Date; status: 'current' | 'due_soon' | 'overdue' };
  };
  melItems: {
    item: string;
    required: boolean;
    status: 'operational' | 'inoperative' | 'deferred';
    remarks?: string;
  }[];
  requiresMEL: boolean;
  melUploaded: boolean;
  aiAnalysis?: {
    model: string;
    prompt: string;
    rawResponse?: string;
    confidence: number;
  };
}

// Combined Flight Safety Audit
export interface ISafetyAudit {
  _id: mongoose.Types.ObjectId;
  // Reference to flight (optional - can be standalone audit)
  flightId?: Types.ObjectId;

  // Component audits
  pilotAudit: IPilotSafetyAudit;
  aircraftAudit: IAircraftMaintenanceAudit;

  // Combined analysis (Gemini synthesis)
  combinedAnalysis: {
    airworthiness: boolean;
    pilotCurrencyStatus: 'current' | 'expiring' | 'expired';
    combinedRiskFactor: number; // 0-100, lower is safer
    overallRecommendation: 'go' | 'caution' | 'no-go';
    reasoning: string;
    mitigationSteps: string[];
    riskScenarios: IRiskScenario[];
  };

  // Weather consideration (if flight-specific)
  weatherAnalysis?: {
    departureConditions: string;
    arrivalConditions?: string;
    enrouteHazards: string[];
    weatherVsPilotRating: 'safe' | 'marginal' | 'unsafe';
  };

  // Metadata
  status: AuditStatus;
  generatedBy: 'system' | 'manual' | 'ai';
  aiModel?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Schemas
const PilotSafetyFindingSchema = new Schema<IPilotSafetyFinding>({
  category: { type: String, required: true },
  riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  message: { type: String, required: true },
  recommendation: { type: String },
  regulatoryReference: { type: String },
}, { _id: false });

const AircraftSafetyFindingSchema = new Schema<IAircraftSafetyFinding>({
  component: { type: String, required: true },
  status: { type: String, enum: ['ok', 'warning', 'critical'], required: true },
  message: { type: String, required: true },
  lastInspectionDate: { type: Date },
  dueDate: { type: Date },
  regulatoryReference: { type: String },
}, { _id: false });

const InspectionStatusSchema = new Schema({
  lastDate: { type: Date },
  dueDate: { type: Date },
  batteryExpiration: { type: Date },
  status: { type: String, enum: ['current', 'due_soon', 'overdue', 'na'], default: 'na' },
}, { _id: false });

const RiskScenarioSchema = new Schema<IRiskScenario>({
  title: { type: String, required: true },
  probability: { type: Number, required: true, min: 0, max: 100 },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  description: { type: String, required: true },
  mitigations: [{ type: String }],
  affectedSystems: [{ type: String }],
}, { _id: false });

const MELItemSchema = new Schema({
  item: { type: String, required: true },
  required: { type: Boolean, default: true },
  status: { type: String, enum: ['operational', 'inoperative', 'deferred'], default: 'operational' },
  remarks: { type: String },
}, { _id: false });

const PilotSafetyAuditSchema = new Schema<IPilotSafetyAudit>({
  pilotId: { type: Schema.Types.ObjectId, ref: 'Pilot', required: true },
  analyzedAt: { type: Date, required: true },
  overallScore: { type: Number, required: true, min: 1, max: 100 },
  riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  currencyStatus: { type: String, enum: ['current', 'expiring', 'expired'], required: true },
  experienceLevel: { type: String, enum: ['student', 'low_time', 'experienced', 'professional'], required: true },
  findings: [PilotSafetyFindingSchema],
  qualifications: {
    certificateType: { type: String },
    medicalClass: { type: String, enum: ['1st', '2nd', '3rd', 'BasicMed'] },
    instrumentRated: { type: Boolean, default: false },
    multiEngineRated: { type: Boolean, default: false },
    cfi: { type: Boolean, default: false },
    cfii: { type: Boolean, default: false },
    endorsements: [{ type: String }],
    typeRatings: [{ type: String }],
    categoryClassRatings: [{ type: String }],
  },
  recency: {
    totalHours: { type: Number, default: 0 },
    last30DaysHours: { type: Number, default: 0 },
    last90DaysHours: { type: Number, default: 0 },
    nightHours: { type: Number, default: 0 },
    ifrHours: { type: Number, default: 0 },
  },
  expirations: {
    medical: { type: Date },
    flightReview: { type: Date },
  },
  aiAnalysis: {
    model: { type: String },
    prompt: { type: String },
    rawResponse: { type: String },
    confidence: { type: Number, min: 0, max: 1 },
  },
}, { _id: false });

const AircraftMaintenanceAuditSchema = new Schema<IAircraftMaintenanceAudit>({
  aircraftId: { type: Schema.Types.ObjectId, ref: 'Aircraft', required: true },
  analyzedAt: { type: Date, required: true },
  overallScore: { type: Number, required: true, min: 1, max: 100 },
  airworthinessStatus: { type: String, enum: ['airworthy', 'conditional', 'grounded'], required: true },
  findings: [AircraftSafetyFindingSchema],
  inspections: {
    annual: InspectionStatusSchema,
    vor: InspectionStatusSchema,
    hundredHour: InspectionStatusSchema,
    altimeter: InspectionStatusSchema,
    transponder: InspectionStatusSchema,
    elt: InspectionStatusSchema,
    staticSystem: InspectionStatusSchema,
  },
  melItems: [MELItemSchema],
  requiresMEL: { type: Boolean, default: false },
  melUploaded: { type: Boolean, default: false },
  aiAnalysis: {
    model: { type: String },
    prompt: { type: String },
    rawResponse: { type: String },
    confidence: { type: Number, min: 0, max: 1 },
  },
}, { _id: false });

const SafetyAuditSchema = new Schema<ISafetyAudit>(
  {
    flightId: { type: Schema.Types.ObjectId, ref: 'Flight', index: true },
    pilotAudit: { type: PilotSafetyAuditSchema, required: true },
    aircraftAudit: { type: AircraftMaintenanceAuditSchema, required: true },
    combinedAnalysis: {
      airworthiness: { type: Boolean, required: true },
      pilotCurrencyStatus: { type: String, enum: ['current', 'expiring', 'expired'], required: true },
      combinedRiskFactor: { type: Number, required: true, min: 0, max: 100 },
      overallRecommendation: { type: String, enum: ['go', 'caution', 'no-go'], required: true },
      reasoning: { type: String, required: true },
      mitigationSteps: [{ type: String }],
      riskScenarios: [RiskScenarioSchema],
    },
    weatherAnalysis: {
      departureConditions: { type: String },
      arrivalConditions: { type: String },
      enrouteHazards: [{ type: String }],
      weatherVsPilotRating: { type: String, enum: ['safe', 'marginal', 'unsafe'] },
    },
    status: { type: String, enum: ['pending', 'in_progress', 'completed', 'failed'], default: 'pending' },
    generatedBy: { type: String, enum: ['system', 'manual', 'ai'], default: 'system' },
    aiModel: { type: String },
  },
  {
    timestamps: true,
  }
);

// Indexes
SafetyAuditSchema.index({ 'pilotAudit.pilotId': 1, createdAt: -1 });
SafetyAuditSchema.index({ 'aircraftAudit.aircraftId': 1, createdAt: -1 });
SafetyAuditSchema.index({ status: 1 });

// Prevent model recompilation in Next.js dev mode
if (process.env.NODE_ENV === 'development' && mongoose.models.SafetyAudit) {
  delete mongoose.models.SafetyAudit;
}

const SafetyAudit: Model<ISafetyAudit> = mongoose.models.SafetyAudit || mongoose.model<ISafetyAudit>('SafetyAudit', SafetyAuditSchema);

export default SafetyAudit;
