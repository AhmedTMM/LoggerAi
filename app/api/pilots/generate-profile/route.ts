import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';
import Pilot from '@/lib/models/Pilot';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { parseDocument } from '@/lib/services/reductoService';
import { generatePilotProfile } from '@/lib/services/aiService';

/**
 * POST /api/pilots/generate-profile
 *
 * Generates a complete pilot profile from logbook upload using AI.
 * This is a "drop and go" endpoint - upload logbook, get full profile.
 *
 * Body:
 * - fileBase64: Base64 encoded logbook file
 * - fileType: 'pdf' | 'image'
 * - name?: Optional pilot name (if known)
 * - email?: Optional pilot email (if known)
 * - createPilot?: boolean - If true, creates the pilot in the database
 */
export async function POST(request: NextRequest) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await dbConnect();
    const body = await request.json();

    const { fileBase64, fileType, name, email, createPilot } = body;

    if (!fileBase64) {
      return NextResponse.json(
        { success: false, error: 'Logbook file is required (fileBase64)' },
        { status: 400 }
      );
    }

    // Step 1: Parse the logbook using Reducto
    console.log('[ProfileGen] Parsing logbook with Reducto...');
    const parseResult = await parseDocument(
      fileBase64,
      fileType || 'image',
      'logbook'
    );

    if (!parseResult.success || !parseResult.data?.extractedData?.entries) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to parse logbook. Please ensure the file is readable.',
          parseError: parseResult.error
        },
        { status: 400 }
      );
    }

    const flightEntries = parseResult.data.extractedData.entries;
    console.log(`[ProfileGen] Extracted ${flightEntries.length} flight entries`);

    if (flightEntries.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No flight entries found in the logbook. Please check the file format.'
        },
        { status: 400 }
      );
    }

    // Step 2: Generate pilot profile using Gemini AI
    console.log('[ProfileGen] Generating profile with Gemini AI...');
    const generatedProfile = await generatePilotProfile(flightEntries, {
      name: name || undefined,
      email: email || undefined
    });

    console.log('[ProfileGen] Profile generated successfully');

    // Step 3: Optionally create the pilot in the database
    let savedPilot = null;
    let savedDocument = null;

    if (createPilot) {
      console.log('[ProfileGen] Creating pilot in database...');

      // Check if email already exists for this user
      const existingPilot = await Pilot.findOne({ email: generatedProfile.email, userId });
      if (existingPilot) {
        return NextResponse.json(
          {
            success: false,
            error: `A pilot with email ${generatedProfile.email} already exists.`,
            profile: generatedProfile
          },
          { status: 409 }
        );
      }

      // Save the parsed document first
      savedDocument = await ParsedDocument.create({
        userId,
        filename: body.filename || `logbook_${Date.now()}.pdf`,
        documentType: 'logbook',
        status: 'completed',
        extractedData: parseResult.data.extractedData,
        summary: {
          totalEntries: flightEntries.length,
          totalHours: generatedProfile.experience.totalHours,
          dateRange: {
            start: flightEntries[0]?.date,
            end: flightEntries[flightEntries.length - 1]?.date
          }
        }
      });

      // Create the pilot with all the generated data
      savedPilot = await Pilot.create({
        userId,
        name: generatedProfile.name,
        email: generatedProfile.email,
        certificates: generatedProfile.certificates,
        endorsements: generatedProfile.endorsements,
        experience: generatedProfile.experience,
        medicalExpiration: generatedProfile.medicalExpiration,
        flightReviewExpiration: generatedProfile.flightReviewExpiration,
        flightEntries: generatedProfile.flightEntries,
        linkedDocuments: [savedDocument._id]
      });

      // Link document back to pilot
      await ParsedDocument.findByIdAndUpdate(savedDocument._id, {
        linkedPilot: savedPilot._id
      });

      console.log('[ProfileGen] Pilot created:', savedPilot._id);
    }

    return NextResponse.json({
      success: true,
      profile: generatedProfile,
      pilot: savedPilot,
      document: savedDocument ? {
        _id: savedDocument._id,
        filename: savedDocument.filename,
        entriesCount: flightEntries.length
      } : null,
      message: createPilot
        ? 'Pilot profile generated and saved successfully'
        : 'Pilot profile generated. Review and confirm to create pilot.'
    });

  } catch (error) {
    console.error('[ProfileGen] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate pilot profile' },
      { status: 500 }
    );
  }
}
