// Aircraft Types
export type LogbookCategory = 'engine' | 'airframe' | 'propeller' | 'avionics';

export interface MaintenanceDates {
  annual: Date | string;
  transponder: Date | string;
  staticSystem: Date | string;
  hundredHour?: Date | string;
}

export interface AirworthinessStatus {
  annual?: Date | string;
  transponder?: Date | string;
  altimeter?: Date | string;
  staticSystem?: Date | string;
  vor?: Date | string;
  elt?: Date | string;
  hundredHour?: Date | string;
}

export interface MELItem {
  item: string;
  required: boolean;
  remarks?: string;
}

export interface CurrentHours {
  hobbs: number;
  tach: number;
}

export interface LogEntry {
  date: Date | string;
  description: string;
  hobbsTime: number;
  tachTime: number;
  mechanic?: string;
  rawText?: string;
  category?: LogbookCategory;
}

export interface Aircraft {
  _id: string;
  tailNumber: string;
  model: string;
  serial: string;
  manufacturer: string;
  year: number;
  imageUrl?: string;
  pohUrl?: string;
  operatingLimits?: {
    vSpeeds?: {
      vso?: number;
      vs1?: number;
      vr?: number;
      vx?: number;
      vy?: number;
      vfe?: number;
      va?: number;
      vno?: number;
      vne?: number;
    };
    weights?: {
      maxGross?: number;
      empty?: number;
      usefulLoad?: number;
      fuelCapacity?: number;
    };
  };
  maintenanceDates: MaintenanceDates;
  airworthinessStatus?: AirworthinessStatus;
  mel?: MELItem[];
  currentHours: CurrentHours;
  safetyAnalysis?: {
    lastAnalyzed: Date | string;
    score: number;
    findings: {
      component: string;
      status: 'ok' | 'warning' | 'critical';
      message: string;
      lastMentioned?: Date | string;
    }[];
  };
  logs: LogEntry[];
  logbooks?: {
    engine: LogEntry[];
    airframe: LogEntry[];
    propeller: LogEntry[];
    avionics: LogEntry[];
  };
  owner?: {
    name: string;
    email: string;
  };
  scrapedData?: {
    lastScraped: Date | string;
    source: string;
    rawData?: any;
  };
  createdAt: Date | string;
  updatedAt: Date | string;
}

// Pilot Types
export interface Certificate {
  type: 'Student' | 'PPL' | 'CPL' | 'ATP' | 'Sport';
  instrumentRated: boolean;
  multiEngineRated: boolean;
}

export interface Endorsement {
  type: 'High Performance' | 'Complex' | 'Tailwheel' | 'High Altitude';
  date: Date | string;
  instructor: string;
}

export interface Experience {
  totalHours: number;
  picHours: number;
  nightHours: number;
  ifrHours: number;
  crossCountryHours?: number;
  last90DaysHours: number;
  last30DaysHours: number;
}

export interface FlightEntry {
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

export interface Pilot {
  _id: string;
  name: string;
  email: string;
  certificates: Certificate;
  endorsements: Endorsement[];
  experience: Experience;
  flightEntries?: FlightEntry[];
  linkedDocuments?: string[];
  medicalExpiration: Date | string;
  flightReviewExpiration: Date | string;
  weatherExperience?: {
    totalFlights: number;
    flightsWithWeather: number;
    vfr: number;
    mvfr: number;
    ifr: number;
    lifr: number;
    lastUpdated: Date | string;
  };
  safetyAnalysis?: {
    lastAnalyzed: Date | string;
    score: number;
    findings: {
      category: string;
      riskLevel: 'low' | 'medium' | 'high';
      message: string;
    }[];
  };
  createdAt: Date | string;
  updatedAt: Date | string;
}

// Flight Types
export type FlightStatus = 'planned' | 'go' | 'caution' | 'no-go' | 'completed' | 'cancelled';

export interface LegalityCheck {
  category: 'maintenance' | 'compliance' | 'safety' | 'pilot';
  item: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
  details?: string;
}

export interface WeatherData {
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
  fetchedAt: Date | string;
}

export interface Flight {
  _id: string;
  pilot: Pilot | string;
  pilotName?: string;
  aircraft: Aircraft | string;
  aircraftTailNumber?: string;
  aircraftModel?: string;
  scheduledDate: Date | string;
  departureAirport: string;
  arrivalAirport?: string;
  status: FlightStatus;
  legalityChecks: LegalityCheck[];
  overallStatus: 'go' | 'caution' | 'no-go';
  weather?: WeatherData;
  arrivalWeather?: WeatherData;
  safetyAnalysisSnapshot?: any;
  notes?: string;
  emailSent: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
