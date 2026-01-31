import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';

// Allow longer timeout for large file uploads
export const maxDuration = 60;

// Upload-only endpoint - stores file without parsing
export async function POST(request: NextRequest) {
  try {
    // Use text() instead of json() to handle larger payloads
    // The default json() has ~1MB limit which fails silently for large PDFs
    let body;
    try {
      const rawBody = await request.text();
      body = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('Body parse error:', parseError);
      return NextResponse.json(
        { success: false, error: 'Failed to parse request. File may be too large (max 50MB).' },
        { status: 400 }
      );
    }

    const { fileBase64, fileType, documentType, aircraftId, pilotId, filename } = body;

    if (!fileBase64 || !fileType || !documentType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: fileBase64, fileType, documentType' },
        { status: 400 }
      );
    }

    // Validate file size (base64 is ~33% larger than binary)
    // Limit to ~70MB base64 which is ~50MB actual file
    const fileSizeBytes = Math.ceil((fileBase64.length * 3) / 4);
    const maxSizeBytes = 70 * 1024 * 1024; // 70MB base64 (~50MB file)

    if (fileSizeBytes > maxSizeBytes) {
      return NextResponse.json(
        { success: false, error: `File too large. Maximum size is 50MB. Your file is ${Math.round(fileSizeBytes / 1024 / 1024)}MB` },
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
