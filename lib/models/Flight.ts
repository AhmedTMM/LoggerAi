import mongoose, { Schema, Model, Types } from 'mongoose';

export type FlightStatus = 'planned' | 'go' | 'caution' | 'no-go' | 'completed' | 'cancelled';

export interface ILegalityCheck {
  category: 'maintenance' | 'compliance' | 'safety' | 'pilot';
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
  fetchedAt: Date;
}

export interface IFlight {
  _id: mongoose.Types.ObjectId;
  pilot: Types.ObjectId;
  aircraft: Types.ObjectId;
  scheduledDate: Date;
  scheduledTime?: Date; // Separate time if needed, though scheduledDate usually covers it
  departureAirport: string;
  arrivalAirport?: string;
  status: FlightStatus;
  legalityChecks: ILegalityCheck[];
  overallStatus: 'go' | 'caution' | 'no-go';
  weather?: IWeatherData;
  safetyAnalysisSnapshot?: any; // Snapshot of the risk analysis at time of creation/audit
  notes?: string;
  emailSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LegalityCheckSchema = new Schema<ILegalityCheck>({
  category: {
    type: String,
    enum: ['maintenance', 'compliance', 'safety', 'pilot'],
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
  fetchedAt: { type: Date, required: true },
});

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
      type: Date,
    },
    safetyAnalysisSnapshot: {
      type: Schema.Types.Mixed,
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
    notes: { type: String },
    emailSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Flight: Model<IFlight> = mongoose.models.Flight || mongoose.model<IFlight>('Flight', FlightSchema);

export default Flight;
