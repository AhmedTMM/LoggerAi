import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Pilot from '@/lib/models/Pilot';
import { parseDocument, aggregateLogbookHours } from '@/lib/services/reductoService';

export async function GET() {
  try {
    await dbConnect();
    const pilots = await Pilot.find().select('-flightEntries -linkedDocuments').sort({ name: 1 });
    return NextResponse.json({ success: true, data: pilots });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const body = await request.json();

    // Pilot Data from user input
    const pilotData = {
      name: body.name,
      email: body.email,
      certificates: body.certificates || {
        type: 'Student',
        instrumentRated: false,
        multiEngineRated: false
      },
      endorsements: body.endorsements || [],
      experience: body.experience || {
        totalHours: 0,
        picHours: 0,
        nightHours: 0,
        ifrHours: 0,
        last90DaysHours: 0,
        last30DaysHours: 0
      },
      medicalExpiration: body.medicalExpiration || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      flightReviewExpiration: body.flightReviewExpiration || new Date(Date.now() + 730 * 24 * 60 * 60 * 1000)
    };

    // Process Logbook Upload (Reducto) if provided
    if (body.logbookBase64) {
      try {
        const fileType = body.fileType || 'image';
        const parseResult = await parseDocument(body.logbookBase64, fileType, 'logbook');

        if (parseResult.success && parseResult.data?.extractedData?.entries) {
          const aggregated = aggregateLogbookHours(parseResult.data.extractedData.entries);
          pilotData.experience = {
            totalHours: aggregated.totalHours || pilotData.experience.totalHours,
            picHours: aggregated.picHours || pilotData.experience.picHours,
            nightHours: aggregated.nightHours || pilotData.experience.nightHours,
            ifrHours: aggregated.ifrHours || pilotData.experience.ifrHours,
            last90DaysHours: aggregated.last90DaysHours || pilotData.experience.last90DaysHours,
            last30DaysHours: aggregated.last30DaysHours || pilotData.experience.last30DaysHours
          };
        }
      } catch (err) {
        console.error('Logbook processing failed:', err);
      }
    }

    const pilot = new Pilot(pilotData);
    await pilot.save();

    return NextResponse.json({ success: true, data: pilot }, { status: 201 });
  } catch (error) {
    console.error('Create pilot error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}
