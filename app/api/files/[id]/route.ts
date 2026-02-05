import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import ParsedDocument from '@/lib/models/ParsedDocument';
import { readFile, fileExists } from '@/lib/services/fileStorage';
import { requireAuth } from '@/lib/auth-helpers';
import mongoose from 'mongoose';

// Sanitize filename for Content-Disposition header to prevent header injection
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^\w\s.\-]/g, '_').substring(0, 255);
}

// Serve a stored file by document ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, userId } = await requireAuth();
    if (error) return error;

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid document ID' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Only serve files owned by the authenticated user
    const doc = await ParsedDocument.findOne({ _id: id, userId }).lean();

    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    const safeFilename = sanitizeFilename(doc.originalFilename || doc.filename || 'document');

    // Check if we have a file path
    if (doc.filePath) {
      const exists = await fileExists(doc.filePath);
      if (exists) {
        const fileBuffer = await readFile(doc.filePath);
        const mimeType = doc.fileType === 'pdf' ? 'application/pdf' : 'image/png';

        return new NextResponse(new Uint8Array(fileBuffer), {
          headers: {
            'Content-Type': mimeType,
            'Content-Disposition': `inline; filename="${safeFilename}"`,
            'Cache-Control': 'private, max-age=3600',
            'X-Content-Type-Options': 'nosniff',
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
          'Content-Disposition': `inline; filename="${safeFilename}"`,
          'X-Content-Type-Options': 'nosniff',
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
      { success: false, error: 'Failed to serve file' },
      { status: 500 }
    );
  }
}
