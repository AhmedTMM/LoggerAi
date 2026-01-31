import mongoose, { Schema, Model, Types } from 'mongoose';

export type FlightStatus = 'planned' | 'go' | 'caution' | 'no-go' | 'completed' | 'cancelled';

export interface ILegalityCheck {
  category: 'maintenance' | 'compliance' | 'safety' | 'pilot' | 'weather' | 'performance';
  item: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
  details?: string;
}

export interface IWeatherData {
  station: string;
  metar: string;
  taf?: string;
  flightCategory: 'VFR' | 'MVFR' | 'IFR' | 'LIFR';
  visibility: number;
  ceiling?: number;
  wind: {
    direction: number;
    speed: number;
    gust?: number;
  };
  // Enhanced weather data
  temperature?: number;
  dewpoint?: number;
  altimeter?: number;
  densityAltitude?: number;
  pressureAltitude?: number;
  trend?: 'improving' | 'stable' | 'deteriorating';
  hazards?: {
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'extreme';
  }[];
  fetchedAt: Date;
}

// Parsed flight planner data (from PaperlessFBO, ForeFlight, etc.)
export interface IFlightPlannerData {
  source: 'paperlessfbo' | 'foreflight' | 'garmin' | 'manual' | 'photo_upload';
  uploadedAt: Date;
  imageUrl?: string;
  parsedData: {
    pilotName?: string;
    aircraftTail?: string;
    date?: string;
    departureTime?: string;
    arrivalTime?: string;
    departureAirport?: string;
    arrivalAirport?: string;
    route?: string;
    fuelOnBoard?: number;
    passengers?: number;
    remarks?: string;
    // Weight & Balance
    grossWeight?: number;
    cg?: number;
    // Additional parsed fields
    flightType?: 'local' | 'cross_country' | 'training' | 'checkride';
    estimatedDuration?: number;
    alternateAirport?: string;
  };
  rawText?: string;
  confidence: number;
}

// Comprehensive safety analysis result
export interface IComprehensiveSafetyAnalysis {
  generatedAt: Date;
  overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  overallScore: number; // 1-100, higher is safer

  weatherAnalysis: {
    departureConditions: IWeatherData | null;
    arrivalConditions?: IWeatherData | null;
    enrouteHazards: string[];
    weatherVsPilot: {
      legal: boolean;
      safeRecommendation: boolean;
      warnings: string[];
      recommendations: string[];
    };
    weatherVsAircraft: {
      safeToOperate: boolean;
      warnings: string[];
      recommendations: string[];
    };
  };

  pilotAnalysis: {
    currencyStatus: 'current' | 'expiring' | 'expired';
    experienceLevel: 'student' | 'low_time' | 'experienced' | 'professional';
    qualifiedForConditions: boolean;
    riskFactors: string[];
    aiSafetyScore?: number;
  };

  aircraftAnalysis: {
    maintenanceStatus: 'current' | 'due_soon' | 'overdue';
    performanceMargins: 'adequate' | 'marginal' | 'inadequate';
    mechanicalRisks: string[];
    aiSafetyScore?: number;
  };

  combinedRiskScenarios: {
    title: string;
    probability: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    mitigations?: string[];
  }[];

  goNoGoRecommendation: 'go' | 'caution' | 'no-go';
  reasoning: string;
}

export interface IFlight {
  _id: mongoose.Types.ObjectId;
  pilot: Types.ObjectId;
  aircraft: Types.ObjectId;
  // Scheduling
  scheduledDate: Date;
  scheduledTime?: string; // HH:MM format for display
  scheduledDateTime: Date; // Combined date and time
  estimatedDuration?: number; // in hours
  // Route
  departureAirport: string;
  arrivalAirport?: string;
  alternateAirport?: string;
  route?: string;
  // Status
  status: FlightStatus;
  legalityChecks: ILegalityCheck[];
  overallStatus: 'go' | 'caution' | 'no-go';
  // Weather
  weather?: IWeatherData;
  arrivalWeather?: IWeatherData;
  // Flight planner integration
  flightPlannerData?: IFlightPlannerData;
  // Comprehensive safety analysis
  safetyAnalysisSnapshot?: IComprehensiveSafetyAnalysis;
  // Legacy snapshot format support
  legacySafetySnapshot?: any;
  // Notes
  notes?: string;
  emailSent: boolean;
  preFlightAlertSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LegalityCheckSchema = new Schema<ILegalityCheck>({
  category: {
    type: String,
    enum: ['maintenance', 'compliance', 'safety', 'pilot', 'weather', 'performance'],
    required: true,
  },
  item: { type: String, required: true },
  status: {
    type: String,
    enum: ['pass', 'warning', 'fail'],
    required: true,
  },
  message: { type: String, required: true },
  details: { type: String },
});

const WeatherHazardSchema = new Schema({
  type: { type: String },
  description: { type: String },
  severity: { type: String, enum: ['low', 'medium', 'high', 'extreme'] },
}, { _id: false });

const WeatherDataSchema = new Schema<IWeatherData>({
  station: { type: String, required: true },
  metar: { type: String, required: true },
  taf: { type: String },
  flightCategory: {
    type: String,
    enum: ['VFR', 'MVFR', 'IFR', 'LIFR'],
    required: true,
  },
  visibility: { type: Number, required: true },
  ceiling: { type: Number },
  wind: {
    direction: { type: Number, required: true },
    speed: { type: Number, required: true },
    gust: { type: Number },
  },
  temperature: { type: Number },
  dewpoint: { type: Number },
  altimeter: { type: Number },
  densityAltitude: { type: Number },
  pressureAltitude: { type: Number },
  trend: { type: String, enum: ['improving', 'stable', 'deteriorating'] },
  hazards: [WeatherHazardSchema],
  fetchedAt: { type: Date, required: true },
});

const FlightPlannerDataSchema = new Schema<IFlightPlannerData>({
  source: {
    type: String,
    enum: ['paperlessfbo', 'foreflight', 'garmin', 'manual', 'photo_upload'],
    required: true,
  },
  uploadedAt: { type: Date, required: true },
  imageUrl: { type: String },
  parsedData: {
    pilotName: { type: String },
    aircraftTail: { type: String },
    date: { type: String },
    departureTime: { type: String },
    arrivalTime: { type: String },
    departureAirport: { type: String },
    arrivalAirport: { type: String },
    route: { type: String },
    fuelOnBoard: { type: Number },
    passengers: { type: Number },
    remarks: { type: String },
    grossWeight: { type: Number },
    cg: { type: Number },
    flightType: { type: String, enum: ['local', 'cross_country', 'training', 'checkride'] },
    estimatedDuration: { type: Number },
    alternateAirport: { type: String },
  },
  rawText: { type: String },
  confidence: { type: Number, default: 0 },
});

const RiskScenarioSchema = new Schema({
  title: { type: String },
  probability: { type: Number },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
  description: { type: String },
  mitigations: [{ type: String }],
}, { _id: false });

const ComprehensiveSafetyAnalysisSchema = new Schema({
  generatedAt: { type: Date },
  overallRiskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
  overallScore: { type: Number },
  weatherAnalysis: {
    departureConditions: { type: Schema.Types.Mixed },
    arrivalConditions: { type: Schema.Types.Mixed },
    enrouteHazards: [{ type: String }],
    weatherVsPilot: {
      legal: { type: Boolean },
      safeRecommendation: { type: Boolean },
      warnings: [{ type: String }],
      recommendations: [{ type: String }],
    },
    weatherVsAircraft: {
      safeToOperate: { type: Boolean },
      warnings: [{ type: String }],
      recommendations: [{ type: String }],
    },
  },
  pilotAnalysis: {
    currencyStatus: { type: String, enum: ['current', 'expiring', 'expired'] },
    experienceLevel: { type: String, enum: ['student', 'low_time', 'experienced', 'professional'] },
    qualifiedForConditions: { type: Boolean },
    riskFactors: [{ type: String }],
    aiSafetyScore: { type: Number },
  },
  aircraftAnalysis: {
    maintenanceStatus: { type: String, enum: ['current', 'due_soon', 'overdue'] },
    performanceMargins: { type: String, enum: ['adequate', 'marginal', 'inadequate'] },
    mechanicalRisks: [{ type: String }],
    aiSafetyScore: { type: Number },
  },
  combinedRiskScenarios: [RiskScenarioSchema],
  goNoGoRecommendation: { type: String, enum: ['go', 'caution', 'no-go'] },
  reasoning: { type: String },
}, { _id: false });

const FlightSchema = new Schema<IFlight>(
  {
    pilot: {
      type: Schema.Types.ObjectId,
      ref: 'Pilot',
      required: true,
      index: true,
    },
    aircraft: {
      type: Schema.Types.ObjectId,
      ref: 'Aircraft',
      required: true,
      index: true,
    },
    scheduledDate: {
      type: Date,
      required: true,
      index: true,
    },
    scheduledTime: {
      type: String,
    },
    scheduledDateTime: {
      type: Date,
      index: true,
    },
    estimatedDuration: {
      type: Number,
    },
    departureAirport: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    arrivalAirport: {
      type: String,
      uppercase: true,
      trim: true,
    },
    alternateAirport: {
      type: String,
      uppercase: true,
      trim: true,
    },
    route: {
      type: String,
    },
    status: {
      type: String,
      enum: ['planned', 'go', 'caution', 'no-go', 'completed', 'cancelled'],
      default: 'planned',
      index: true,
    },
    legalityChecks: [LegalityCheckSchema],
    overallStatus: {
      type: String,
      enum: ['go', 'caution', 'no-go'],
      default: 'no-go',
    },
    weather: WeatherDataSchema,
    arrivalWeather: WeatherDataSchema,
    flightPlannerData: FlightPlannerDataSchema,
    safetyAnalysisSnapshot: ComprehensiveSafetyAnalysisSchema,
    legacySafetySnapshot: {
      type: Schema.Types.Mixed,
    },
    notes: { type: String },
    emailSent: {
      type: Boolean,
      default: false,
    },
    preFlightAlertSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to compute scheduledDateTime from date + time
FlightSchema.pre('save', function(next) {
  if (this.scheduledDate && this.scheduledTime) {
    const [hours, minutes] = this.scheduledTime.split(':').map(Number);
    const dateTime = new Date(this.scheduledDate);
    dateTime.setHours(hours || 0, minutes || 0, 0, 0);
    this.scheduledDateTime = dateTime;
  } else if (this.scheduledDate && !this.scheduledDateTime) {
    this.scheduledDateTime = this.scheduledDate;
  }
  next();
});

const Flight: Model<IFlight> = mongoose.models.Flight || mongoose.model<IFlight>('Flight', FlightSchema);

export default Flight;
