import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Aircraft from '@/lib/models/Aircraft';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { analyzeAircraftSafety } from '@/lib/services/aiService';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const { error, userId } = await requireAuth();
        if (error) return error;

        await dbConnect();
        const { id } = params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json(
                { success: false, error: 'Invalid aircraft ID' },
                { status: 400 }
            );
        }

        const aircraft = await Aircraft.findOne({ _id: id, userId });
        if (!aircraft) {
            return NextResponse.json(
                { success: false, error: 'Aircraft not found' },
                { status: 404 }
            );
        }

        // 1. Fetch Maintenance Logs from linked documents
        const linkedDocs = await ParsedDocument.find({
            $or: [
                { _id: { $in: aircraft.linkedDocuments || [] } },
                { aircraft: id }
            ],
            documentType: 'maintenance',
            status: 'completed'
        });

        // 2. Aggregate Entries from documents and aircraft logs
        const allEntries: any[] = [...(aircraft.logs || [])];
        linkedDocs.forEach(doc => {
            if (doc.entries && Array.isArray(doc.entries)) {
                allEntries.push(...doc.entries);
            }
        });

        // Also aggregate from categorized logbooks if present
        if (aircraft.logbooks) {
            ['engine', 'airframe', 'propeller', 'avionics'].forEach(category => {
                const categoryLogs = (aircraft.logbooks as any)?.[category] || [];
                allEntries.push(...categoryLogs);
            });
        }

        // Sort by Date (desc) and Hobbs (desc) to find latest
        allEntries.sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            if (dateA !== dateB) return dateB - dateA;
            return (b.hobbsTime || 0) - (a.hobbsTime || 0);
        });

        // 3. Try AI Analysis with Gemini Pro 3
        let aiAnalysis = null;
        try {
            aiAnalysis = await analyzeAircraftSafety({
                tailNumber: aircraft.tailNumber,
                manufacturer: aircraft.manufacturer,
                model: aircraft.model,
                year: aircraft.year,
                currentHours: aircraft.currentHours,
                maintenanceDates: aircraft.maintenanceDates,
                logs: allEntries,
            });
        } catch (aiError) {
            console.warn('AI analysis failed, falling back to rule-based:', aiError);
        }

        // 4. If AI analysis succeeded, use it. Otherwise, fallback to rule-based.
        let findings: { component: string; status: 'ok' | 'warning' | 'critical'; message: string; lastMentioned?: Date }[] = [];
        let score = 10;

        if (aiAnalysis && aiAnalysis.findings) {
            findings = aiAnalysis.findings;
            score = aiAnalysis.score;
        } else {
            // Fallback to rule-based analysis
            const componentsToCheck = [
                { key: 'magneto', label: 'Magnetos' },
                { key: 'vacuum pump', label: 'Vacuum Pump' },
                { key: 'cylinder', label: 'Cylinders' },
                { key: 'oil change', label: 'Oil Change' },
                { key: 'annual', label: 'Annual Inspection' },
                { key: 'elt', label: 'ELT Battery' },
                { key: 'alternator', label: 'Alternator' },
                { key: 'transponder', label: 'Transponder' }
            ];

            const currentHobbs = aircraft.currentHours.hobbs;

            for (const comp of componentsToCheck) {
                const latestEntry = allEntries.find(entry =>
                    (entry.description || '').toLowerCase().includes(comp.key)
                );

                if (latestEntry) {
                    let hoursSince = -1;
                    if (latestEntry.hobbsTime) {
                        hoursSince = currentHobbs - latestEntry.hobbsTime;
                    }

                    if (comp.key === 'magneto' || comp.key === 'vacuum pump' || comp.key === 'alternator') {
                        if (hoursSince > 500) {
                            score -= 2;
                            findings.push({
                                component: comp.label,
                                status: 'warning',
                                message: `Last mentioned ${hoursSince.toFixed(1)} hours ago. Recommended inspection every 500 hours.`,
                                lastMentioned: latestEntry.date
                            });
                        } else {
                            findings.push({
                                component: comp.label,
                                status: 'ok',
                                message: `Serviced ${hoursSince > 0 ? hoursSince.toFixed(1) + ' hours ago' : 'recently'}.`,
                                lastMentioned: latestEntry.date
                            });
                        }
                    } else if (comp.key === 'oil change') {
                        if (hoursSince > 60) {
                            score -= 1;
                            findings.push({
                                component: comp.label,
                                status: 'warning',
                                message: `Last oil change ${hoursSince.toFixed(1)} hours ago. Recommended every 50 hours.`,
                                lastMentioned: latestEntry.date
                            });
                        } else {
                            findings.push({
                                component: comp.label,
                                status: 'ok',
                                message: `Oil changed ${hoursSince > 0 ? hoursSince.toFixed(1) + ' hours ago' : 'recently'}.`,
                                lastMentioned: latestEntry.date
                            });
                        }
                    } else {
                        findings.push({
                            component: comp.label,
                            status: 'ok',
                            message: `Found in records from ${latestEntry.date || 'unknown date'}.`,
                            lastMentioned: latestEntry.date
                        });
                    }
                } else {
                    if (comp.key === 'annual') {
                        findings.push({
                            component: comp.label,
                            status: 'warning',
                            message: `No record found in uploaded logs. Verify with airframe logbook.`,
                        });
                    } else {
                        score -= 1;
                        findings.push({
                            component: comp.label,
                            status: 'warning',
                            message: `No mention found in analyzed maintenance logs.`,
                        });
                    }
                }
            }
        }

        // 5. Update Aircraft with analysis results
        aircraft.safetyAnalysis = {
            lastAnalyzed: new Date(),
            score: Math.max(0, Math.min(10, score)),
            findings: findings
        };

        await aircraft.save();

        return NextResponse.json({
            success: true,
            data: aircraft.safetyAnalysis,
            method: aiAnalysis ? 'gemini-3-pro-preview' : 'rule-based'
        });

    } catch (error) {
        console.error('Analysis error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to analyze aircraft' },
            { status: 500 }
        );
    }
}
