// File Storage Service
// Handles saving uploaded files to the server filesystem

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

// Base directory for file uploads
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Subdirectories for different document types
const SUBDIRS = {
  logbook: 'logbooks',
  maintenance: 'maintenance',
  poh: 'poh',
  other: 'other'
};

export interface StoredFile {
  filePath: string;
  relativePath: string;
  filename: string;
  originalFilename: string;
  size: number;
  mimeType: string;
}

// Ensure the uploads directory structure exists
async function ensureDirectoryExists(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

// Generate a unique filename to avoid collisions
function generateUniqueFilename(originalFilename: string): string {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalFilename);
  const basename = path.basename(originalFilename, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '_') // Sanitize filename
    .substring(0, 50); // Limit length
  return `${timestamp}_${randomBytes}_${basename}${ext}`;
}

// Get the mime type based on file type
function getMimeType(fileType: 'pdf' | 'image', filename: string): string {
  if (fileType === 'pdf') {
    return 'application/pdf';
  }
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.tiff':
    case '.tif':
      return 'image/tiff';
    default:
      return 'image/png';
  }
}

// Save a file to the uploads directory
export async function saveFile(
  base64Data: string,
  originalFilename: string,
  fileType: 'pdf' | 'image',
  documentType: 'logbook' | 'maintenance' | 'poh' | 'other'
): Promise<StoredFile> {
  // Ensure base uploads directory exists
  await ensureDirectoryExists(UPLOADS_DIR);

  // Get the subdirectory for this document type
  const subdir = SUBDIRS[documentType] || SUBDIRS.other;
  const targetDir = path.join(UPLOADS_DIR, subdir);
  await ensureDirectoryExists(targetDir);

  // Generate unique filename
  const uniqueFilename = generateUniqueFilename(originalFilename);
  const filePath = path.join(targetDir, uniqueFilename);
  const relativePath = path.join(subdir, uniqueFilename);

  // Decode base64 and write to file
  const buffer = Buffer.from(base64Data, 'base64');
  await fs.writeFile(filePath, buffer);

  // Get file stats
  const stats = await fs.stat(filePath);

  return {
    filePath,
    relativePath,
    filename: uniqueFilename,
    originalFilename,
    size: stats.size,
    mimeType: getMimeType(fileType, originalFilename)
  };
}

// Validate that a resolved path is within the uploads directory (prevents path traversal)
function assertSafePath(resolvedPath: string): void {
  const normalizedUploads = path.resolve(UPLOADS_DIR);
  const normalizedTarget = path.resolve(resolvedPath);
  if (!normalizedTarget.startsWith(normalizedUploads + path.sep) && normalizedTarget !== normalizedUploads) {
    throw new Error('Invalid file path');
  }
}

// Read a file from the uploads directory
export async function readFile(relativePath: string): Promise<Buffer> {
  const filePath = path.join(UPLOADS_DIR, relativePath);
  assertSafePath(filePath);
  return fs.readFile(filePath);
}

// Read a file and return as base64
export async function readFileAsBase64(relativePath: string): Promise<string> {
  const buffer = await readFile(relativePath);
  return buffer.toString('base64');
}

// Delete a file from the uploads directory
export async function deleteFile(relativePath: string): Promise<void> {
  const filePath = path.join(UPLOADS_DIR, relativePath);
  assertSafePath(filePath);
  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    // Ignore if file doesn't exist
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

// Check if a file exists
export async function fileExists(relativePath: string): Promise<boolean> {
  const filePath = path.join(UPLOADS_DIR, relativePath);
  assertSafePath(filePath);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Get file stats
export async function getFileStats(relativePath: string): Promise<{ size: number; created: Date; modified: Date } | null> {
  const filePath = path.join(UPLOADS_DIR, relativePath);
  assertSafePath(filePath);
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime
    };
  } catch {
    return null;
  }
}

// Clean up old files (optional utility)
export async function cleanupOldFiles(daysOld: number = 30): Promise<number> {
  let deletedCount = 0;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  for (const subdir of Object.values(SUBDIRS)) {
    const dirPath = path.join(UPLOADS_DIR, subdir);
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = await fs.stat(filePath);
        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return deletedCount;
}
