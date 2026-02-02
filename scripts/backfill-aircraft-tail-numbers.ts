/**
 * Migration script to backfill denormalized fields for existing flights
 * - aircraftTailNumber
 * - aircraftModel
 * - pilotName
 *
 * Run with: npx ts-node scripts/backfill-aircraft-tail-numbers.ts
 * Or: npm run migrate:tail-numbers (if you add it to package.json scripts)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function backfillFlightDenormalizedFields() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aviation-intelligence');
    console.log('Connected successfully!');

    const Flight = mongoose.model('Flight');
    const Aircraft = mongoose.model('Aircraft');
    const Pilot = mongoose.model('Pilot');

    // Find all flights missing any denormalized field
    const flights = await Flight.find({
      $or: [
        { aircraftTailNumber: { $exists: false } },
        { aircraftTailNumber: null },
        { aircraftTailNumber: '' },
        { aircraftModel: { $exists: false } },
        { aircraftModel: null },
        { aircraftModel: '' },
        { pilotName: { $exists: false } },
        { pilotName: null },
        { pilotName: '' }
      ]
    }).select('_id aircraft pilot aircraftTailNumber aircraftModel pilotName');

    console.log(`Found ${flights.length} flights with missing denormalized fields`);

    let updated = 0;
    let errors = 0;

    for (const flight of flights) {
      try {
        const updateFields: any = {};

        // Fetch and update aircraft fields if needed
        if (!flight.aircraftTailNumber || !flight.aircraftModel) {
          const aircraft = await Aircraft.findById(flight.aircraft).select('tailNumber model');

          if (aircraft) {
            if (!flight.aircraftTailNumber && aircraft.tailNumber) {
              updateFields.aircraftTailNumber = aircraft.tailNumber;
            }
            if (!flight.aircraftModel && aircraft.model) {
              updateFields.aircraftModel = aircraft.model;
            }
          }
        }

        // Fetch and update pilot name if needed
        if (!flight.pilotName) {
          const pilot = await Pilot.findById(flight.pilot).select('name');

          if (pilot && pilot.name) {
            updateFields.pilotName = pilot.name;
          }
        }

        // Update the flight if we have any fields to update
        if (Object.keys(updateFields).length > 0) {
          await Flight.updateOne(
            { _id: flight._id },
            { $set: updateFields }
          );
          updated++;

          if (updated % 10 === 0) {
            console.log(`Progress: ${updated}/${flights.length} flights updated`);
          }
        }
      } catch (error) {
        console.error(`Error updating flight ${flight._id}:`, error);
        errors++;
      }
    }

    console.log('\n=== Migration Complete ===');
    console.log(`Successfully updated: ${updated} flights`);
    console.log(`Errors: ${errors}`);
    console.log(`Total processed: ${flights.length}`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
backfillFlightDenormalizedFields();
