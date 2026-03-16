import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_MEDIUM_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const shareSchema = z.object({
  path: z.string().max(MAX_MEDIUM_TEXT_LENGTH).min(1),
  expiresIn: z.number().int().min(60).max(31_536_000).optional(),
});

const shareQuerySchema = z.object({
  path: z.string().max(MAX_MEDIUM_TEXT_LENGTH).min(1),
  expiresIn: z.coerce.number().int().min(60).max(31_536_000).optional(),
});

async function resolveSignedUrl(
  request: Request,
  params: Promise<{ wsId: string }>,
  input: { path: string; expiresIn?: number }
) {
  const { wsId } = await params;
  const supabase = await createClient(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const permissions = await getPermissions({
    wsId: normalizedWsId,
    request,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sanitizedPath = sanitizePath(input.path);
  if (!sanitizedPath) {
    return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
  }

  if (!sanitizedPath.startsWith('task-images/')) {
    return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
  }

  const sbAdmin = await createAdminClient();
  const storagePath = `${normalizedWsId}/${sanitizedPath}`;
  const expiresIn = input.expiresIn ?? 31_536_000;

  const { data, error } = await sbAdmin.storage
    .from('workspaces')
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { message: 'Failed to generate signed URL' },
      { status: 500 }
    );
  }

  return data.signedUrl;
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
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query params', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const signedUrl = await resolveSignedUrl(request, params, parsed.data);

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
