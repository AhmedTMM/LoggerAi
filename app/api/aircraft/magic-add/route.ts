import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Aircraft from '@/lib/models/Aircraft';
import { scrapeAircraftByTailNumber, isValidNNumber } from '@/lib/services/faaScrapingService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for scraping

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const body = await request.json();
    const { tailNumber } = body;

    if (!tailNumber) {
      return NextResponse.json(
        { success: false, error: 'Tail number is required' },
        { status: 400 }
      );
    }

    // Validate N-number format
    if (!isValidNNumber(tailNumber)) {
      return NextResponse.json(
        { success: false, error: 'Invalid N-number format. US registrations start with N followed by 1-5 alphanumeric characters.' },
        { status: 400 }
      );
    }

    // Check if aircraft already exists
    const cleanTail = tailNumber.toUpperCase().startsWith('N')
      ? tailNumber.toUpperCase()
      : `N${tailNumber.toUpperCase()}`;

    const existing = await Aircraft.findOne({ tailNumber: cleanTail });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Aircraft ${cleanTail} already exists in the database.` },
        { status: 409 }
      );
    }

    console.log(`[Magic Add] Starting scrape for ${cleanTail}...`);

    // Scrape aircraft data from FAA and AI
    const scrapedData = await scrapeAircraftByTailNumber(cleanTail);

    if (!scrapedData) {
      return NextResponse.json(
        { success: false, error: `Could not find aircraft data for ${cleanTail}. Please add manually.` },
        { status: 404 }
      );
    }

    console.log(`[Magic Add] Scraped data:`, JSON.stringify({
      tail: scrapedData.tailNumber,
      manufacturer: scrapedData.manufacturer,
      model: scrapedData.model,
      year: scrapedData.year,
    }));

    // Build the aircraft document
    const aircraftData = {
      tailNumber: scrapedData.tailNumber,
      manufacturer: scrapedData.manufacturer,
      model: scrapedData.model,
      year: scrapedData.year,
      serial: scrapedData.serial,
      imageUrl: scrapedData.imageUrl,
      pohUrl: scrapedData.pohUrl,
      currentHours: { hobbs: 0, tach: 0 },
      maintenanceDates: {
        annual: scrapedData.airworthinessStatus?.annual || new Date(),
        transponder: scrapedData.airworthinessStatus?.transponder || new Date(),
        staticSystem: scrapedData.airworthinessStatus?.staticSystem || new Date(),
        hundredHour: scrapedData.airworthinessStatus?.hundredHour,
      },
      airworthinessStatus: scrapedData.airworthinessStatus,
      mel: scrapedData.mel,
      operatingLimits: scrapedData.operatingLimits,
      logbooks: {
        engine: [],
        airframe: [],
        propeller: [],
        avionics: [],
      },
      scrapedData: scrapedData.scrapedData,
    };

    const aircraft = new Aircraft(aircraftData);
    await aircraft.save();

    console.log(`[Magic Add] Successfully created aircraft ${cleanTail}`);

    return NextResponse.json({
      success: true,
      data: aircraft,
      message: `Successfully added ${cleanTail} (${scrapedData.year} ${scrapedData.manufacturer} ${scrapedData.model})`,
    }, { status: 201 });

  } catch (error) {
    console.error('[Magic Add] Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
