import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';

// Upload-only endpoint - stores file without parsing
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileBase64, fileType, documentType, aircraftId, pilotId, filename } = body;

    if (!fileBase64 || !fileType || !documentType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: fileBase64, fileType, documentType' },
        { status: 400 }
      );
    }

    // Validate file size (base64 is ~33% larger than binary)
    // Limit to ~25MB base64 which is ~18MB actual file
    const fileSizeBytes = Math.ceil((fileBase64.length * 3) / 4);
    const maxSizeBytes = 25 * 1024 * 1024; // 25MB

    if (fileSizeBytes > maxSizeBytes) {
      return NextResponse.json(
        { success: false, error: `File too large. Maximum size is 18MB. Your file is ${Math.round(fileSizeBytes / 1024 / 1024)}MB` },
        { status: 400 }
      );
    }

    await dbConnect();

    // Create document record with file stored, ready for parsing
    const doc = await ParsedDocument.create({
      filename: filename || `${documentType}_${Date.now()}.${fileType}`,
      documentType,
      fileType,
      status: 'pending',
      progress: 0,
      progressStep: 'pending',
      retryCount: 0,
      aircraft: aircraftId || undefined,
      pilot: pilotId || undefined,
      fileBase64, // Store for later parsing
    });

    return NextResponse.json({
      success: true,
      data: {
        documentId: doc._id,
        filename: doc.filename,
        status: 'pending',
        progress: 0,
        progressStep: 'pending',
        message: 'File uploaded successfully. Ready for parsing.',
      },
    });
  } catch (error) {
    console.error('Document upload error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
