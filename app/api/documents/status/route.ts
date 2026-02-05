import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { requireAuth } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Missing documentId parameter' },
        { status: 400 }
      );
    }

    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid document ID' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Find the document
    const doc = await ParsedDocument.findOne({ _id: documentId, userId })
      .select('status progress progressStep error summary documentType aircraft pilot')
      .lean();

    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      status: doc.status,
      progress: doc.progress || 0,
      progressStep: doc.progressStep || '',
      error: doc.error,
      summary: doc.summary,
      documentType: doc.documentType,
      linkedPilot: doc.pilot,
      linkedAircraft: doc.aircraft,
    });

  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { success: false, error: 'An internal error occurred while checking document status' },
      { status: 500 }
    );
  }
}

// Also support POST for batch status checks
export async function POST(request: NextRequest) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    const body = await request.json();
    const { documentIds } = body;

    if (!documentIds || !Array.isArray(documentIds)) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid documentIds array' },
        { status: 400 }
      );
    }

    // Validate all document IDs
    const validIds = documentIds.filter((id: string) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid document IDs provided' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Find all documents
    const docs = await ParsedDocument.find({
      _id: { $in: validIds },
      userId
    })
      .select('_id status progress progressStep error summary documentType aircraft pilot')
      .lean();

    const statusMap = docs.reduce((acc, doc) => {
      acc[doc._id.toString()] = {
        status: doc.status,
        progress: doc.progress || 0,
        progressStep: doc.progressStep || '',
        error: doc.error,
        summary: doc.summary,
        documentType: doc.documentType,
        linkedPilot: doc.pilot,
        linkedAircraft: doc.aircraft,
      };
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({
      success: true,
      documents: statusMap,
    });

  } catch (error) {
    console.error('Batch status check error:', error);
    return NextResponse.json(
      { success: false, error: 'An internal error occurred while checking document status' },
      { status: 500 }
    );
  }
}
