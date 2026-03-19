import { sanitizeFilename } from '@tuturuuu/utils/storage-path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireWhiteboardAccess } from '../../access';

const paramsSchema = z.object({
  boardId: z.guid(),
  wsId: z.string().min(1),
});

const uploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
});

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'svg',
  'bmp',
  'ico',
  'avif',
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const parsedParams = paramsSchema.parse(await params);
    const access = await requireWhiteboardAccess(request, parsedParams.wsId);
    if ('error' in access) return access.error;

    const { sbAdmin, wsId } = access;
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    const expectedPrefix = `${wsId}/whiteboards/${parsedParams.boardId}/`;
    if (!path.startsWith(expectedPrefix) || path.includes('..')) {
      return NextResponse.json(
        { error: 'Invalid whiteboard image path' },
        { status: 400 }
      );
    }

    const { data, error } = await sbAdmin.storage
      .from('workspaces')
      .createSignedUrl(path, 60 * 60);

    if (error || !data?.signedUrl) {
      console.error('Failed to create whiteboard image signed URL:', error);
      return NextResponse.json(
        { error: 'Failed to load whiteboard image' },
        { status: 500 }
      );
    }

    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid workspace or whiteboard ID', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error in whiteboard image GET route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string; boardId: string }> }
) {
  try {
    const parsedParams = paramsSchema.parse(await params);
    const access = await requireWhiteboardAccess(request, parsedParams.wsId);
    if ('error' in access) return access.error;

    const { sbAdmin, wsId } = access;
    const body = uploadRequestSchema.parse(await request.json());

    const dotIndex = body.filename.lastIndexOf('.');
    const extension =
      dotIndex !== -1 ? body.filename.slice(dotIndex + 1).toLowerCase() : '';

    if (!extension || !IMAGE_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: 'Unsupported image type' },
        { status: 400 }
      );
    }

    const sanitized = sanitizeFilename(body.filename) || 'whiteboard-image';
    const uniqueName = `${Date.now()}_${crypto.randomUUID()}_${sanitized}`;
    const storagePath = `${wsId}/whiteboards/${parsedParams.boardId}/${uniqueName}`;

    const { data, error } = await sbAdmin.storage
      .from('workspaces')
      .createSignedUploadUrl(storagePath, {
        upsert: false,
      });

    if (error || !data?.signedUrl || !data?.token) {
      console.error('Failed to create whiteboard upload URL:', error);
      return NextResponse.json(
        { error: 'Failed to generate upload URL' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: storagePath,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error in whiteboard image POST route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
