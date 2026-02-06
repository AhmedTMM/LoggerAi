# LoggerAi - Aviation Intelligence Brain

A comprehensive flight safety and compliance management platform for general aviation. LoggerAi provides intelligent flight legality audits, automated logbook parsing, and probabilistic risk analysis to help pilots and operators ensure safe, compliant flights.

## Features

- **Flight Legality Audits** - Automatically generates GO/CAUTION/NO-GO status based on FAA compliance checks
- **Intelligent Logbook Parsing** - Uses AI to parse handwritten and PDF logbooks with OCR support
- **Maintenance Tracking** - Monitors annual inspections, transponder checks, 100-hour inspections, and airworthiness items
- **Risk Analysis** - Probabilistic safety analysis combining weather, pilot currency, and aircraft condition
- **Fleet Management** - Manage multiple aircraft with detailed maintenance histories
- **Pilot Management** - Track certifications, medical status, flight reviews, and experience
- **Weather Integration** - Real-time METAR data from aviationweather.gov
- **Email Notifications** - Automated pre-flight alerts and audit reports

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | Next.js API Routes, MongoDB, Mongoose |
| AI Services | OpenRouter (multi-model), Reducto AI |
| Other | React Query, Leaflet Maps, Recharts, Resend |

## Prerequisites

- Node.js 18+
- MongoDB (local or MongoDB Atlas)
- API keys for: OpenRouter, Reducto AI, Resend

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd LoggerAi
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your values:
   ```
   MONGODB_URI=mongodb://localhost:27017/aviation-intelligence
   OPENROUTER_API_KEY=your_openrouter_api_key
   REDUCTO_API_KEY=your_reducto_api_key
   RESEND_API_KEY=your_resend_api_key
   FIRECRAWL_API_KEY=your_firecrawl_api_key
   ```

4. **Seed sample data (optional)**
   ```bash
   npm run seed
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run seed` | Populate database with sample data |

## Project Structure

```
LoggerAi/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Dashboard
│   ├── aircraft/          # Aircraft management
│   ├── pilots/            # Pilot profiles
│   ├── flights/           # Flight planning & audits
│   ├── maintenance/       # Maintenance tracking
│   ├── files/             # Document management
│   └── api/               # API routes
├── components/            # React components
│   ├── FlightMap.tsx     # Interactive map
│   ├── LogbookUI.tsx     # Logbook interface
│   └── ui/               # Base UI components
├── lib/                   # Shared utilities
│   ├── models/           # Mongoose schemas
│   ├── services/         # Business logic
│   ├── db.ts             # Database connection
│   ├── hooks.ts          # React Query hooks
│   └── types.ts          # TypeScript types
└── scripts/              # Utility scripts
```

## API Endpoints

### Aircraft
- `GET/POST /api/aircraft` - List/create aircraft
- `GET/PUT/DELETE /api/aircraft/[id]` - Manage aircraft
- `GET /api/aircraft/[id]/analyze` - Generate safety analysis

### Pilots
- `GET/POST /api/pilots` - List/create pilots
- `GET/PUT/DELETE /api/pilots/[id]` - Manage pilots
- `GET /api/pilots/[id]/ai-safety` - AI safety analysis

### Flights
- `GET/POST /api/flights` - List/create flights
- `GET/PUT/DELETE /api/flights/[id]` - Manage flights
- `GET /api/audit/[flightId]` - Run legality audit

### Other
- `GET /api/weather/[airport]` - Get METAR data
- `POST /api/documents/upload` - Upload documents

## FAA Compliance & Regulatory Framework

LoggerAi implements compliance checking against **Title 14 of the Code of Federal Regulations (14 CFR)**, the primary body of FAA regulations governing civil aviation in the United States. Every legality check cites the specific FAR section it enforces.

### Aircraft Maintenance Checks (14 CFR Part 91 Subpart E)

| Check | Regulation | Interval | Description |
|-------|-----------|----------|-------------|
| Annual Inspection | 14 CFR 91.409(a) | 12 calendar months | Must be performed by IA holder or repair station |
| 100-Hour Inspection | 14 CFR 91.409(b) | 100 hours time-in-service | Required for aircraft used for hire; 10-hr overfly allowed |
| Transponder Check | 14 CFR 91.413 | 24 calendar months | ATC transponder tests and inspections |
| Altimeter/Static System | 14 CFR 91.411 | 24 calendar months | Required for IFR in controlled airspace |
| VOR Equipment Check | 14 CFR 91.171 | 30 days | Required for IFR; VOT +/-4°, ground +/-4°, airborne +/-6° |
| ELT Inspection | 14 CFR 91.207 | 12 calendar months | Battery replacement at 50% life or 1 hr cumulative use |
| Airworthiness Directives | 14 CFR Part 39 | As specified | Mandatory compliance; aircraft not airworthy if non-compliant |

### Pilot Currency Checks (14 CFR Part 61)

| Check | Regulation | Requirement | Description |
|-------|-----------|-------------|-------------|
| Medical Certificate | 14 CFR 61.23 | Class-dependent | 1st class: 12/6 mo; 2nd: 12 mo; 3rd: 60/24 mo (under/over 40) |
| BasicMed | 14 CFR 61.23(c)(3) | 48-month physical | Alternative to 3rd class; max 6 seats, 6,000 lbs, FL180, 250 KIAS |
| Flight Review | 14 CFR 61.56 | 24 calendar months | 1 hr flight + 1 hr ground; WINGS program is acceptable alternative |
| Day Landing Currency | 14 CFR 61.57(a) | 3 landings / 90 days | Same category, class, type; required to carry passengers |
| Night Landing Currency | 14 CFR 61.57(b) | 3 full-stop / 90 days | 1 hr after sunset to 1 hr before sunrise; required for night pax |
| IFR Currency | 14 CFR 61.57(c) | 6 months | 6 approaches + holding + intercepting/tracking; IPC after grace period |

### Pilot Certificate Types Supported

Per **14 CFR 61.5**, the system tracks the following certificate levels:
- Student Pilot
- Recreational Pilot
- Private Pilot (PPL)
- Commercial Pilot (CPL)
- Airline Transport Pilot (ATP)
- Sport Pilot
- Flight Instructor (CFI / CFII / MEI)
- Remote Pilot (Part 107)

### Medical Certificate Classes (14 CFR 61.23)

| Class | Required For | Duration (Under 40) | Duration (Over 40) |
|-------|-------------|---------------------|---------------------|
| 1st Class | ATP privileges | 12 months | 6 months |
| 2nd Class | Commercial privileges | 12 months | 12 months |
| 3rd Class | Private/recreational | 60 months | 24 months |
| BasicMed | Private (with limitations) | 48-month physical exam cycle | 48-month physical exam cycle |

### Endorsements Tracked (14 CFR 61.31)

| Endorsement | Regulation | Description |
|-------------|-----------|-------------|
| High Performance | 14 CFR 61.31(f) | Aircraft with engine >200 HP |
| Complex | 14 CFR 61.31(e) | Retractable gear, flaps, controllable prop |
| High Altitude | 14 CFR 61.31(g) | Pressurized aircraft >25,000 ft MSL |
| Tailwheel | 14 CFR 61.31(i) | Tailwheel aircraft PIC |
| Solo | 14 CFR 61.87 | Student solo endorsement |
| Solo Cross-Country | 14 CFR 61.93 | Student solo XC endorsement |
| Checkride | 14 CFR 61.39 | Practical test endorsement |
| Knowledge Test | 14 CFR 61.35 | Written test endorsement |

### Required Instruments & Equipment (14 CFR 91.205)

The system validates equipment against the FAA-required instrument lists:
- **VFR Day** (A-TOMATO-FLAMES mnemonic): Airspeed, Tachometer, Oil pressure, Manifold pressure, Altimeter, Temperature, Oil temp, Fuel gauge, Landing gear indicator, Anti-collision lights, Magnetic compass, ELT, Safety belts
- **VFR Night** (add FLAPS): Fuses, Landing light (for hire), Anti-collision, Position lights, Source of electrical energy
- **IFR** (add GRABCARD): Generator, Radios, Altimeter (sensitive), Ball, Clock, Attitude indicator, Rate-of-turn, DME/RNAV, Directional gyro

### Weather Safety Analysis

- VFR weather minimums per airspace class (14 CFR 91.155)
- Special VFR requirements (14 CFR 91.157)
- IFR alternate airport requirements (14 CFR 91.169 - "1-2-3 rule")
- Fuel reserve requirements: VFR day 30 min, VFR night 45 min, IFR 45 min (14 CFR 91.151/91.167)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key |
| `REDUCTO_API_KEY` | Yes | Reducto AI API key |
| `RESEND_API_KEY` | Yes | Resend email API key |
| `FIRECRAWL_API_KEY` | No | Firecrawl web scraping key |
| `PORT` | No | Server port (default: 3000) |

## Disclaimer

This software is provided as a **decision-support tool** for general aviation pilots and operators. It is **NOT** a certified aviation product under any FAA Technical Standard Order (TSO), and has **NOT** been approved or endorsed by the FAA.

- All regulatory references cite 14 CFR (Title 14, Code of Federal Regulations) as published by the FAA
- Pilots remain solely responsible for compliance with all applicable FARs
- Always verify currency, airworthiness, and weather with official FAA sources
- This tool does not replace proper flight planning, pre-flight inspections, or pilot judgment
- Regulatory information may not reflect the most recent amendments to 14 CFR

## License

MIT License - see [LICENSE](LICENSE) for details.

This project is open source under the MIT License, which permits use, modification, and distribution for both private and commercial purposes with attribution.
