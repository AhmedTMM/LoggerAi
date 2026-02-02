# Flight Record Denormalization Migration

## What Changed

Added denormalized fields to the Flight model to store commonly accessed data directly, eliminating the need to rely on populated objects:
- `aircraftTailNumber` - Aircraft tail number (e.g., "N12345")
- `aircraftModel` - Aircraft model (e.g., "Cessna 172")
- `pilotName` - Pilot name (e.g., "John Smith")

### Benefits
- **Simpler**: Data is immediately available without needing population
- **More Reliable**: Works with cached/stale data
- **Better Performance**: Reduces database queries and joins
- **Better UX**: Flight playback and displays work consistently across all pages

## Changes Made

### 1. Database Schema
- Added `aircraftTailNumber`, `aircraftModel`, and `pilotName` fields to Flight model (`lib/models/Flight.ts`)
- Added pre-save middleware to automatically populate these fields when flights are created

### 2. Frontend Updates
- Updated `app/pilots/page.tsx` to use denormalized fields directly
- Updated `app/flights/page.tsx` to use denormalized fields as fallback
- Flight playback now uses tail number directly instead of requiring populated aircraft object
- Aircraft/pilot display uses embedded data with fallback to populated objects

### 3. Types
- Updated `lib/types.ts` to include all denormalized fields in Flight interface

### 4. Build Fixes
- Fixed TypeScript build error in `app/aircraft/page.tsx` where `getDaysUntil` could receive undefined dates

## Migration Required

Existing flights in the database need to have their denormalized fields populated.

### Option 1: Run Migration Script

```bash
# Using ts-node
npx ts-node scripts/backfill-aircraft-tail-numbers.ts

# Or using tsx (if installed)
npx tsx scripts/backfill-aircraft-tail-numbers.ts
```

### Option 2: Add to package.json

Add this script to your `package.json`:

```json
{
  "scripts": {
    "migrate:denormalize": "tsx scripts/backfill-aircraft-tail-numbers.ts"
  }
}
```

Then run:

```bash
npm run migrate:denormalize
```

### Option 3: Manual via MongoDB Shell

```javascript
// Connect to your database
use aviation_intelligence

// Update all flights with missing denormalized fields
db.flights.find({
  $or: [
    { aircraftTailNumber: { $exists: false } },
    { aircraftModel: { $exists: false } },
    { pilotName: { $exists: false } }
  ]
}).forEach(function(flight) {
  const updateFields = {};

  // Get aircraft data
  const aircraft = db.aircraft.findOne({ _id: flight.aircraft });
  if (aircraft) {
    if (aircraft.tailNumber) updateFields.aircraftTailNumber = aircraft.tailNumber;
    if (aircraft.model) updateFields.aircraftModel = aircraft.model;
  }

  // Get pilot data
  const pilot = db.pilots.findOne({ _id: flight.pilot });
  if (pilot && pilot.name) {
    updateFields.pilotName = pilot.name;
  }

  // Update flight
  if (Object.keys(updateFields).length > 0) {
    db.flights.updateOne(
      { _id: flight._id },
      { $set: updateFields }
    );
  }
});
```

## Backwards Compatibility

The code is fully backwards compatible:
- New flights automatically get denormalized fields set via pre-save middleware
- Frontend code falls back to populated objects if denormalized fields are missing
- No breaking changes to existing functionality

## Testing

After migration, test:
1. **Pilots Page**:
   - Select a pilot with flight history
   - Verify flight aircraft info displays correctly
   - Click the flight playback button (▶️) for any planned flight
   - Verify the modal opens with correct aircraft tail number
   - Verify the ADS-B Exchange link works correctly

2. **Flights Page**:
   - Check that flight list shows correct aircraft tail numbers
   - Verify flight detail view shows correct pilot names and aircraft info
   - Test with both old (pre-migration) and new flights

3. **Create New Flight**:
   - Create a new flight
   - Verify denormalized fields are automatically populated
   - Check the database to confirm fields are set
