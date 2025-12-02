import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { checkChangelogPermission } from '../utils';

// Route segment config for file uploads
export const maxDuration = 60;

// Allowed MIME types for changelog media
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
]);

// Allowed extensions for changelog media
const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.mp4',
  '.webm',
]);

export async function POST(request: Request) {
  const supabase = await createClient();

  const { authorized, user } = await checkChangelogPermission(supabase);
  if (!authorized) {
    return NextResponse.json(
      { message: user ? 'Forbidden' : 'Unauthorized' },
      { status: user ? 403 : 401 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { message: 'Missing file in request body' },
        { status: 400 }
      );
    }

    // Validate file size (50 MB limit for changelog media)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { message: 'File size exceeds 50 MB limit' },
        { status: 413 }
      );
    }

    // Validate file type
    const lastDotIndex = file.name.lastIndexOf('.');
    const fileExtension =
      lastDotIndex === -1
        ? ''
        : file.name.substring(lastDotIndex).toLowerCase();

    let isValid = false;
    if (file.type && fileExtension) {
      isValid =
        ALLOWED_MIME_TYPES.has(file.type) &&
        ALLOWED_EXTENSIONS.has(fileExtension);
    } else if (file.type) {
      isValid = ALLOWED_MIME_TYPES.has(file.type);
    } else if (fileExtension) {
      isValid = ALLOWED_EXTENSIONS.has(fileExtension);
    }

    if (!isValid) {
      return NextResponse.json(
        {
          message: `File type not allowed. Supported types: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`,
        },
        { status: 415 }
      );
    }

    // Generate unique filename to prevent conflicts
    const uniqueId = uuidv4();
    const sanitizedName = file.name
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '-')
      .replace(/-+/g, '-');
    const storagePath = `${uniqueId}-${sanitizedName}`;

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage (changelog bucket)
    const { data, error } = await supabase.storage
      .from('changelog')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (error) {
      console.error('Error uploading file:', error);
      return NextResponse.json(
        { message: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Get public URL for the uploaded file
    const {
      data: { publicUrl },
    } = supabase.storage.from('changelog').getPublicUrl(data.path);

    return NextResponse.json({
      message: 'File uploaded successfully',
      url: publicUrl,
      path: data.path,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
