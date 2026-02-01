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
| AI Services | Google Gemini, Reducto AI |
| Other | React Query, Leaflet Maps, Recharts, Resend |

## Prerequisites

- Node.js 18+
- MongoDB (local or MongoDB Atlas)
- API keys for: Google Gemini, Reducto AI, Resend

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
   GEMINI_API_KEY=your_gemini_api_key
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

## Compliance Checks

The audit engine evaluates:

**Aircraft**
- Annual inspection (12 months)
- Transponder check (24 months)
- Static system check (IFR)
- 100-hour inspection (for hire)

**Pilot**
- Medical certificate currency
- Flight review (24 months)
- Landing currency (90 days)
- IFR currency (if applicable)

**Weather**
- VFR/IFR conditions vs. pilot ratings
- Crosswind limits
- Visibility minimums

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `REDUCTO_API_KEY` | Yes | Reducto AI API key |
| `RESEND_API_KEY` | Yes | Resend email API key |
| `FIRECRAWL_API_KEY` | No | Firecrawl web scraping key |
| `PORT` | No | Server port (default: 3000) |

## License

MIT
