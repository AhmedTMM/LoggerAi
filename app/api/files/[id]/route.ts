import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { readFile, fileExists } from '@/lib/services/fileStorage';

// Serve a stored file by document ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await dbConnect();

    const doc = await ParsedDocument.findById(id).lean();

    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    // Check if we have a file path
    if (doc.filePath) {
      const exists = await fileExists(doc.filePath);
      if (exists) {
        const fileBuffer = await readFile(doc.filePath);
        const mimeType = doc.fileType === 'pdf' ? 'application/pdf' : 'image/png';

        return new NextResponse(new Uint8Array(fileBuffer), {
          headers: {
            'Content-Type': mimeType,
            'Content-Disposition': `inline; filename="${doc.originalFilename || doc.filename}"`,
            'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
          },
        });
      }
    }

    // Fallback to base64 if available
    if (doc.fileBase64) {
      const fileBuffer = Buffer.from(doc.fileBase64, 'base64');
      const mimeType = doc.fileType === 'pdf' ? 'application/pdf' : 'image/png';

      return new NextResponse(new Uint8Array(fileBuffer), {
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `inline; filename="${doc.originalFilename || doc.filename}"`,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: 'File not available' },
      { status: 404 }
    );
  } catch (error) {
    console.error('File serve error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
