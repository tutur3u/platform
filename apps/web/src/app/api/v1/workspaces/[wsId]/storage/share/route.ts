import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { imageTransformOptionsSchema } from '@tuturuuu/types';
import { MAX_MEDIUM_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createWorkspaceStorageSignedReadUrl,
  WorkspaceStorageError,
} from '@/lib/workspace-storage-provider';

const shareSchema = z.object({
  path: z.string().max(MAX_MEDIUM_TEXT_LENGTH).min(1),
  expiresIn: z.number().int().min(60).max(31_536_000).optional(),
  transform: imageTransformOptionsSchema.optional(),
});

const shareQuerySchema = z
  .object({
    path: z.string().max(MAX_MEDIUM_TEXT_LENGTH).min(1),
    expiresIn: z.coerce.number().int().min(60).max(31_536_000).optional(),
    width: z.coerce.number().int().min(1).max(2500).finite().optional(),
    height: z.coerce.number().int().min(1).max(2500).finite().optional(),
    resize: z.enum(['cover', 'contain', 'fill']).optional(),
    quality: z.coerce.number().int().min(20).max(100).finite().optional(),
    format: z.literal('origin').optional(),
  })
  .superRefine((data, ctx) => {
    const hasTransform =
      data.width !== undefined ||
      data.height !== undefined ||
      data.resize !== undefined ||
      data.quality !== undefined ||
      data.format !== undefined;

    if (hasTransform && data.width === undefined && data.height === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['width'],
        message: 'transform must include width or height',
      });
    }
  });

async function resolveSignedUrl(
  request: Request,
  params: Promise<{ wsId: string }>,
  input: {
    path: string;
    expiresIn?: number;
    transform?: z.infer<typeof imageTransformOptionsSchema>;
  }
) {
  const { wsId } = await params;
  const supabase = await createClient(request);

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const permissions = await getPermissions({
    wsId: normalizedWsId,
    request,
  });

  const sanitizedPath = sanitizePath(input.path);
  if (!sanitizedPath) {
    return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
  }

  const isTaskImagesPath =
    sanitizedPath === 'task-images' || sanitizedPath.startsWith('task-images/');

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (permissions.withoutPermission('view_drive')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  if (
    isTaskImagesPath &&
    permissions.withoutPermission('manage_drive_tasks_directory')
  ) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  try {
    return await createWorkspaceStorageSignedReadUrl(
      normalizedWsId,
      sanitizedPath,
      {
        expiresIn: input.expiresIn ?? 31_536_000,
        transform: input.transform,
      }
    );
  } catch (error) {
    if (error instanceof WorkspaceStorageError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { message: 'Failed to generate signed URL' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const parsed = shareSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const signedUrl = await resolveSignedUrl(request, params, parsed.data);

    if (signedUrl instanceof NextResponse) {
      return signedUrl;
    }

    return NextResponse.json({ signedUrl });
  } catch (error) {
    console.error('Unexpected error generating signed URL:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = shareQuerySchema.safeParse({
      path: searchParams.get('path'),
      expiresIn: searchParams.get('expiresIn') ?? undefined,
      width: searchParams.get('width') ?? undefined,
      height: searchParams.get('height') ?? undefined,
      resize: searchParams.get('resize') ?? undefined,
      quality: searchParams.get('quality') ?? undefined,
      format: searchParams.get('format') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query params', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { width, height, resize, quality, format, ...baseInput } =
      parsed.data;
    const hasTransform =
      width !== undefined ||
      height !== undefined ||
      resize !== undefined ||
      quality !== undefined ||
      format !== undefined;

    const signedUrl = await resolveSignedUrl(request, params, {
      ...baseInput,
      transform: hasTransform
        ? { width, height, resize, quality, format }
        : undefined,
    });

    if (signedUrl instanceof NextResponse) {
      return signedUrl;
    }

    return NextResponse.redirect(signedUrl, { status: 307 });
  } catch (error) {
    console.error('Unexpected error generating share redirect:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
