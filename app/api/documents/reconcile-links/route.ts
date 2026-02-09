import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Pilot from '@/lib/models/Pilot';
import Aircraft from '@/lib/models/Aircraft';
import { requireAuth } from '@/lib/auth-helpers';
import { PILOT_DOC_TYPES, AIRCRAFT_DOC_TYPES } from '@/lib/documentTypes';
import { fetchAircraftDetails } from '@/lib/services/firecrawlService';
import { updateLinkedRecords } from '@/lib/services/documentUploadHelpers';

/**
 * POST /api/documents/reconcile-links
 *
 * Finds completed documents with missing entity links and attempts to resolve them.
 * Document-type-aware: pilot docs only link to pilots, aircraft docs only link to aircraft.
 * Creates aircraft records when an aircraft-type document references a tail number
 * that doesn't exist in the database.
 */
export async function POST(request: NextRequest) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    await dbConnect();

    // Find completed documents that might be missing links
    const candidates = await ParsedDocument.find({
      userId,
      status: 'completed',
      $or: [
        { pilot: null },
        { aircraft: null },
      ],
    })
      .select('_id filename documentType analysis pilot aircraft entries')
      .lean();

    if (candidates.length === 0) {
      return NextResponse.json({ success: true, reconciled: 0, created: { aircraft: 0 } });
    }

    const [allPilots, allAircraft] = await Promise.all([
      Pilot.find({ userId }).select('_id name').lean(),
      Aircraft.find({ userId }).select('_id tailNumber').lean(),
    ]);

    // Track aircraft created during this reconciliation so multiple docs
    // referencing the same tail don't create duplicates
    const createdAircraftMap = new Map<string, string>(); // normalizedTail -> _id

    let reconciled = 0;
    let aircraftCreated = 0;

    for (const doc of candidates) {
      const updates: Record<string, any> = {};
      const analysis = doc.analysis as any;
      const docType = (doc as any).documentType || 'other';
      const isPilotDoc = PILOT_DOC_TYPES.includes(docType);
      const isAircraftDoc = AIRCRAFT_DOC_TYPES.includes(docType);

      // Only link pilots to pilot-type documents
      if (!doc.pilot && isPilotDoc && allPilots.length > 0 && analysis) {
        const pilotName = analysis.matchedPilotName || analysis.pilotName;
        if (pilotName && pilotName.length >= 2) {
          const norm = pilotName.toLowerCase().trim();
          const matched = allPilots.find((p: any) => {
            const pn = (p.name || '').toLowerCase();
            return pn.includes(norm) || norm.includes(pn);
          });
          if (matched) {
            updates.pilot = matched._id;
          }
        }
      }

      // Only link aircraft to aircraft-type documents
      if (!doc.aircraft && isAircraftDoc) {
        // Collect tail numbers: filename first (most reliable), then AI analysis
        const tails: string[] = [];

        // 1. Extract from filename (e.g. "N6196P-Airframe-Log.pdf")
        if (doc.filename) {
          const m = doc.filename.match(/\b(N[0-9A-Z]{1,5})\b/i);
          if (m) tails.push(m[1].toUpperCase());
        }

        // 2. From AI analysis
        if (analysis?.matchedAircraftTails?.length) {
          tails.push(...analysis.matchedAircraftTails);
        } else if (analysis?.aircraftTailNumbers?.length) {
          tails.push(...analysis.aircraftTailNumbers);
        }

        // Deduplicate
        const uniqueTails = Array.from(new Set(tails));

        for (const tail of uniqueTails) {
          const norm = tail.toUpperCase().replace(/[^A-Z0-9]/g, '');

          // Check existing aircraft
          const matched = allAircraft.find((a: any) => {
            const at = (a.tailNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            return at === norm || at.includes(norm) || norm.includes(at);
          });

          if (matched) {
            updates.aircraft = matched._id;
            break;
          }

          // Check if we already created this aircraft in this reconciliation batch
          if (createdAircraftMap.has(norm)) {
            updates.aircraft = createdAircraftMap.get(norm);
            break;
          }

          // No match found — enrich from FAA registry, then create
          try {
            const tailUpper = tail.toUpperCase();
            let aircraftData: any = {
              userId,
              tailNumber: tailUpper,
              model: analysis?.aircraftType || 'Unknown',
              serial: 'Unknown',
              manufacturer: 'Unknown',
              year: new Date().getFullYear(),
              maintenanceDates: { annual: new Date(), transponder: new Date(), staticSystem: new Date() },
              currentHours: { hobbs: 0, tach: 0 },
              logs: [],
            };

            // Try FAA registry lookup BEFORE creating (so aircraft has real data)
            try {
              const details = await fetchAircraftDetails(tailUpper);
              if (details.success && details.data) {
                aircraftData = {
                  ...aircraftData,
                  manufacturer: details.data.manufacturer || aircraftData.manufacturer,
                  model: details.data.model || aircraftData.model,
                  serial: details.data.serial || aircraftData.serial,
                  year: details.data.year || aircraftData.year,
                  imageUrl: details.data.imageUrl,
                  operatingLimits: details.data.operatingLimits,
                };
                console.log(`[Reconcile] Enriched ${tailUpper}: ${aircraftData.manufacturer} ${aircraftData.model}`);
              }
            } catch (err) {
              console.error(`[Reconcile] FAA lookup failed for ${tailUpper}:`, err);
            }

            const newAircraft = await Aircraft.create(aircraftData);
            const newId = newAircraft._id.toString();
            updates.aircraft = newAircraft._id;
            createdAircraftMap.set(norm, newId);
            // Add to allAircraft so subsequent docs can match without re-creating
            allAircraft.push({ _id: newAircraft._id, tailNumber: tailUpper } as any);
            aircraftCreated++;
            console.log(`[Reconcile] Created aircraft ${tailUpper} (${newId})`);
            break;
          } catch (createErr: any) {
            // Handle duplicate key (race condition or concurrent reconcile)
            if (createErr.code === 11000) {
              const existing = await Aircraft.findOne({ userId, tailNumber: tail.toUpperCase() });
              if (existing) {
                updates.aircraft = existing._id;
                createdAircraftMap.set(norm, existing._id.toString());
                allAircraft.push({ _id: existing._id, tailNumber: tail.toUpperCase() } as any);
                break;
              }
            } else {
              console.error(`[Reconcile] Failed to create aircraft ${tail}:`, createErr);
            }
          }
        }
      }

      // Apply updates
      if (Object.keys(updates).length > 0) {
        await ParsedDocument.findByIdAndUpdate(doc._id, { $set: updates });

        if (updates.pilot) {
          await Pilot.findByIdAndUpdate(updates.pilot, {
            $addToSet: { linkedDocuments: doc._id },
          });
        }
        if (updates.aircraft) {
          await Aircraft.findByIdAndUpdate(updates.aircraft, {
            $addToSet: { linkedDocuments: doc._id },
          });
        }

        // Propagate document data to linked records (hours, inspections, experience)
        const docEntries = (doc as any).entries || [];
        if (docEntries.length > 0) {
          try {
            await updateLinkedRecords({
              pilotId: updates.pilot?.toString(),
              aircraftId: updates.aircraft?.toString(),
              documentType: docType,
              entries: docEntries,
              userId,
            });
          } catch (err) {
            console.error(`[Reconcile] updateLinkedRecords failed for doc ${doc._id}:`, err);
          }
        }

        reconciled++;
      }
    }

    return NextResponse.json({ success: true, reconciled, created: { aircraft: aircraftCreated } });
  } catch (error) {
    console.error('Reconcile links error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reconcile document links' },
      { status: 500 }
    );
  }
}
