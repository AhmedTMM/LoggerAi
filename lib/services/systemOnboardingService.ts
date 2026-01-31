import dbConnect from '@/lib/db';
import { classifyDocumentFast } from './aiService';
import { parseDocument } from './reductoService';
import { saveFile } from './fileStorage';
import { reconcileDocumentLinks } from './reconciliationService';
import ParsedDocument from '@/lib/models/ParsedDocument';
import Flight from '@/lib/models/Flight';
import Pilot from '@/lib/models/Pilot';
import Aircraft from '@/lib/models/Aircraft';
import { runComprehensiveSafetyAnalysis } from './comprehensiveSafetyService';

interface OnboardingFile {
    name: string;
    type: string; // MIME type
    base64: string;
}

interface OnboardingProgress {
    fileName: string;
    status: 'processing' | 'completed' | 'error';
    message?: string;
}

type OnboardingCallback = (progress: OnboardingProgress) => void;

export async function runSystemOnboarding(
    files: OnboardingFile[],
    userEmail: string, // owner email
    onProgress?: OnboardingCallback // callback not really usable in server-less streaming easily, but good for design
) {
    await dbConnect();
    const results = {
        pilots: [] as string[],
        aircraft: [] as string[],
        flights: [] as string[],
        documents: [] as string[],
        errors: [] as string[]
    };

    console.log(`[MagicOnboarding] Starting processing for ${files.length} files...`);

    // 1. Process files (Upload -> Classify -> Parse -> Reconcile)
    const processedDocs = [];

    for (const file of files) {
        try {
            console.log(`[MagicOnboarding] Processing ${file.name}...`);

            // Save file
            const fileType = file.type.includes('pdf') ? 'pdf' : 'image';
            const storedFile = await saveFile(file.base64, file.name, fileType as 'pdf' | 'image', 'other');

            // Create Document Record
            const doc = new ParsedDocument({
                filename: file.name,
                originalFilename: file.name,
                filePath: storedFile.relativePath,
                fileSize: storedFile.size,
                uploadedAt: new Date(),
                status: 'parsing', // Start as parsing
                fileType: fileType as 'pdf' | 'image',
                documentType: 'other' // Placeholder
            });
            await doc.save();

            // Classify
            const fileTypeStr = file.type.includes('pdf') ? 'pdf' : 'image';
            const classificationResult = await classifyDocumentFast(file.base64, fileTypeStr);

            if (classificationResult.success && classificationResult.classification) {
                const cls = classificationResult.classification;

                // Ensure detectedType is valid
                const validTypes = ['pilot_logbook', 'aircraft_logbook', 'maintenance', 'inspection', 'poh', 'weight_balance', 'insurance', 'registration', 'medical', 'certificate', 'endorsement', 'checkout', 'ad_compliance', 'service_bulletin', 'logbook', 'other'];
                const safeType = validTypes.includes(cls.detectedType) ? cls.detectedType : 'other';

                doc.documentType = safeType as any;
                doc.analysis = {
                    detectedType: cls.detectedType as any,
                    confidence: cls.confidence,
                    summary: cls.summary,
                    pilotName: cls.matchedPilotName || cls.pilotName, // Map to schema field
                    aircraftTailNumbers: cls.matchedAircraftTails || cls.aircraftTailNumbers // Map to schema field
                } as any;
                await doc.save();
            }

            // Parse (Reducto)
            // Use Fast Parse (OCR+Gemini) for speed
            let extractedData: any = {};
            try {
                const docTypeForParse = doc.documentType === 'pilot_logbook' ? 'logbook' :
                    doc.documentType === 'maintenance' ? 'maintenance' : 'logbook'; // Default fallback

                const parseResult = await parseDocument(file.base64, fileTypeStr, docTypeForParse);

                if (parseResult.success && parseResult.data) {
                    extractedData = parseResult.data.extractedData;
                    // Schema has 'entries' and 'rawOutput', not 'extractedData' at root
                    if (extractedData.entries) {
                        doc.entries = extractedData.entries;
                    }
                    doc.rawOutput = extractedData;
                    doc.status = 'completed';
                    await doc.save();
                } else {
                    console.warn(`[MagicOnboarding] Parse failed for ${file.name}: ${parseResult.error || 'Unknown error'}`);
                    doc.status = 'failed';
                    await doc.save();
                }
            } catch (parseErr) {
                console.error(`[MagicOnboarding] Parse exception for ${file.name}:`, parseErr);
                doc.status = 'failed';
                await doc.save();
            }

            // Reconcile (Link to Pilot/Aircraft)
            const reconciliation = await reconcileDocumentLinks(doc._id.toString());

            processedDocs.push({
                docId: doc._id,
                ...reconciliation,
                classification: classificationResult.classification
            });
            results.documents.push(doc._id.toString());

            if (reconciliation.success) {
                if ((reconciliation as any).pilotLinked) results.pilots.push((reconciliation as any).pilotId!);
                if ((reconciliation as any).aircraftLinked) results.aircraft.push((reconciliation as any).aircraftId!);
            }

        } catch (err) {
            console.error(`[MagicOnboarding] Error processing ${file.name}:`, err);
            results.errors.push(`${file.name}: ${(err as Error).message}`);
        }
    }

    // 2. Magic "Flight Generation"
    // If we found both a pilot and an aircraft in this batch (or linked to existing), create a demo flight.
    const uniquePilots = Array.from(new Set(results.pilots));
    const uniqueAircraft = Array.from(new Set(results.aircraft));

    if (uniquePilots.length > 0 && uniqueAircraft.length > 0) {
        // Pick the first pair
        const pilotId = uniquePilots[0];
        const aircraftId = uniqueAircraft[0];

        // Check if a flight already exists for them recently? Nah, just create one for the demo.
        // Create a flight for "Tomorrow Night" to trigger interesting risks (Night currency?)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(20, 0, 0, 0); // 8 PM (Night)

        console.log(`[MagicOnboarding] Creating Magic Flight for Pilot ${pilotId} and Aircraft ${aircraftId}`);

        const flight = new Flight({
            pilot: pilotId,
            aircraft: aircraftId,
            departureAirport: 'KLAX', // Default to LAX for demo
            arrivalAirport: 'KLAS', // Default to Vegas
            scheduledDate: tomorrow,
            scheduledTime: '20:00',
            scheduledDateTime: tomorrow,
            status: 'planned',
            overallStatus: 'no-go', // Default, will be updated by analysis
        });

        await flight.save();
        results.flights.push(flight._id.toString());

        // 3. Trigger Safety Audit (which triggers Alerts)
        try {
            await runComprehensiveSafetyAnalysis(flight._id.toString());
            console.log(`[MagicOnboarding] Flight ${flight._id} audited.`);
        } catch (auditErr) {
            console.error(`[MagicOnboarding] Audit failed for flight ${flight._id}:`, auditErr);
        }
    }

    return results;
}
