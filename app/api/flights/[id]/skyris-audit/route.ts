import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import Flight from '@/lib/models/Flight';
import Pilot from '@/lib/models/Pilot';
import Aircraft from '@/lib/models/Aircraft';
import { requireAuth } from '@/lib/auth-helpers';
import { runSkyrisAudit, getLatestSkyrisAudit } from '@/lib/services/skyrisAuditService';

/**
 * POST /api/flights/[id]/skyris-audit
 * Run Skyris combined pilot + aircraft audit for a flight
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid ID' },
        { status: 400 }
      );
    }

    // Get flight with populated pilot and aircraft
    const flight = await Flight.findOne({ _id: id, userId })
      .populate('pilot')
      .populate('aircraft');

    if (!flight) {
      return NextResponse.json(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }

    if (!flight.pilot || !flight.aircraft) {
      return NextResponse.json(
        { success: false, error: 'Flight missing pilot or aircraft data' },
        { status: 400 }
      );
    }

    // Parse request options
    let options = {
      isIFRFlight: false,
      isForHire: false,
    };

    try {
      const body = await request.json();
      options = {
        isIFRFlight: body.isIFRFlight || false,
        isForHire: body.isForHire || false,
      };
    } catch {
      // Use defaults
    }

    // Run Skyris audit
    const auditResult = await runSkyrisAudit(
      flight.pilot as any,
      flight.aircraft as any,
      {
        flightId: id,
        isIFRFlight: options.isIFRFlight,
        isForHire: options.isForHire,
        saveToDb: true,
      }
    );

    // Update flight with safety audit reference
    if (auditResult) {
      (flight as any).safetyAnalysisSnapshot = {
        overallRiskLevel: auditResult.combinedAudit.combined_risk_factor <= 30 ? 'low' :
                         auditResult.combinedAudit.combined_risk_factor <= 60 ? 'medium' :
                         auditResult.combinedAudit.combined_risk_factor <= 80 ? 'high' : 'critical',
        overallScore: 100 - auditResult.combinedAudit.combined_risk_factor,
        goNoGoRecommendation: auditResult.combinedAudit.overall_recommendation,
        reasoning: auditResult.combinedAudit.reasoning,
        pilotAnalysis: {
          currencyStatus: auditResult.combinedAudit.pilot_currency_status,
          experienceLevel: auditResult.pilotAudit.experienceLevel,
          riskFactors: auditResult.pilotAudit.findings.map((f: any) => ({
            category: f.category,
            riskLevel: f.riskLevel,
            description: f.message,
            mitigation: f.recommendation,
          })),
          aiSafetyScore: auditResult.pilotAudit.overallScore,
        },
        aircraftAnalysis: {
          maintenanceStatus: auditResult.aircraftAudit.airworthinessStatus,
          airworthinessItems: Object.entries(auditResult.av1onicsAudit?.checks || {}).map(([key, check]: [string, any]) => ({
            item: check.name,
            status: check.status === 'current' ? 'current' : check.status === 'due_soon' ? 'due_soon' : 'overdue',
            dueDate: check.dueDate,
          })),
          mechanicalRisks: auditResult.aircraftAudit.findings.map((f: any) => ({
            component: f.component,
            severity: f.status,
            description: f.message,
          })),
          aiSafetyScore: auditResult.aircraftAudit.overallScore,
        },
        combinedRiskScenarios: auditResult.combinedAudit.risk_scenarios?.map((s: any) => ({
          title: s.title,
          probability: s.probability,
          severity: s.severity,
          description: s.description,
          mitigations: [],
        })) || [],
      };

      await flight.save();
    }

    return NextResponse.json({
      success: true,
      audit: auditResult,
      combinedResult: auditResult.combinedAudit,
    });
  } catch (error) {
    console.error('Skyris audit error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to run Skyris audit' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/flights/[id]/skyris-audit
 * Get latest Skyris audit for a flight
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid ID' },
        { status: 400 }
      );
    }

    // Get flight
    const flight = await Flight.findOne({ _id: id, userId });

    if (!flight) {
      return NextResponse.json(
        { success: false, error: 'Flight not found' },
        { status: 404 }
      );
    }

    // Get latest audit for this pilot/aircraft pair
    const audit = await getLatestSkyrisAudit(
      flight.pilot.toString(),
      flight.aircraft.toString()
    );

    if (!audit) {
      return NextResponse.json({
        success: true,
        audit: null,
        message: 'No audit found. Run POST to generate one.',
      });
    }

    return NextResponse.json({
      success: true,
      audit,
    });
  } catch (error) {
    console.error('Get Skyris audit error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get audit' },
      { status: 500 }
    );
  }
}
