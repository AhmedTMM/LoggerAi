# Aviation Intelligence - Project Context

## Overview
Flight safety and compliance platform for General Aviation. Parses logbooks via Reducto AI, runs FAA compliance audits, and provides probabilistic risk analysis.

## Tech Stack
- **Framework**: Next.js 14 (App Router), TypeScript
- **Styling**: Tailwind CSS, Lucide-React icons
- **Database**: MongoDB via Mongoose
- **State**: TanStack Query
- **APIs**: Reducto AI (document parsing), aviationweather.gov (METAR), Resend (emails)

## Pages

### Home (`/`)
Simple stats dashboard: fleet size, pilot count, upcoming flights, quick actions, recent flights.

### Aircraft (`/aircraft`)
- Aircraft cards with image thumbnails
- **Logbook tab**: Upload maintenance PDF → Reducto parses entries
- **Details tab**: Hobbs/Tach times, maintenance status (annual/transponder/100-hr)
- **Component risk indicators**: Alternator, vacuum pump, magnetos, engine failure probability

### Pilots (`/pilots`)
- **Overview tab**: Hours (total/PIC/night/IFR), safety gap analysis (expired medical, low night hours)
- **Logbook tab**: Upload pilot logbook → parse flight entries via Reducto
- **Safety tab**: NTSB database search for accident history

### Flights (`/flights`)
- Weather lookup widget (METAR display)
- Flight list with status badges (GO/CAUTION/NO-GO)
- **Risk Scenarios**: Probabilistic analysis combining:
  - Electrical failure + night flight + student pilot = CRITICAL
  - Weather deterioration + VFR-only pilot = HIGH
  - Engine failure based on TBO position
- Pilot/Aircraft assessment cards
- FAA compliance checks from legalityService

## Key Services

### `lib/services/reductoService.ts`
Parses logbooks via Reducto AI. Detailed JSON schema prompt for structured extraction.

### `lib/services/legalityService.ts`
FAA compliance engine with full 14 CFR citations:
- Aircraft (Part 91 Subpart E): Annual (91.409a), Transponder (91.413), Altimeter/Static (91.411), 100-Hour (91.409b), ELT (91.207), VOR (91.171)
- Pilot (Part 61): Medical (61.23) with BasicMed support, Flight Review (61.56) with WINGS alternative, Day/Night Landing Currency (61.57a/b), IFR Currency (61.57c)
- Weather: VFR minimums (91.155), IFR vs pilot ratings, wind analysis

### `lib/faaRegulations.ts`
Comprehensive FAA regulatory constants: 14 CFR Parts 39, 43, 61, 91, 107, NTSB 830. All checks, endorsements, instruments, and currency requirements with section references.

## Environment Variables
```
MONGODB_URI=mongodb://localhost:27017/aviation-intelligence
REDUCTO_API_KEY=your_key
RESEND_API_KEY=your_key
```