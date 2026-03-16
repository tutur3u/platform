import {
  createAdminClient,
  createClient,
  createDynamicAdminClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
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
  taskId: z.uuid().optional(),
});

const shareQuerySchema = z.object({
  path: z.string().max(MAX_MEDIUM_TEXT_LENGTH).min(1),
  expiresIn: z.coerce.number().int().min(60).max(31_536_000).optional(),
  taskId: z.uuid().optional(),
});

async function hasSharedTaskAccess({
  normalizedWsId,
  taskId,
  userId,
  sbAdmin,
}: {
  normalizedWsId: string;
  taskId: string;
  userId: string;
  sbAdmin: TypedSupabaseClient;
}) {
  const { data: taskRow, error: taskError } = await sbAdmin
    .from('tasks')
    .select('id, task_lists!inner(workspace_boards!inner(ws_id))')
    .eq('id', taskId)
    .is('deleted_at', null)
    .maybeSingle();

  if (taskError || !taskRow) {
    return false;
  }

  const taskWorkspaceId = taskRow.task_lists?.workspace_boards?.ws_id;
  if (taskWorkspaceId !== normalizedWsId) {
    return false;
  }

  const { data: memberCheck, error: memberError } = await sbAdmin
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', normalizedWsId)
    .eq('user_id', userId)
    .maybeSingle();

  if (memberError) {
    console.error(
      'Error checking workspace membership for share:',
      memberError
    );
    return false;
  }

  if (memberCheck) {
    return true;
  }

  const { data: userPrivateDetails } = await sbAdmin
    .from('user_private_details')
    .select('email')
    .eq('user_id', userId)
    .maybeSingle();

  const email = userPrivateDetails?.email ?? null;

  // First, check for a direct user-based share.
  const { data: directShare, error: directShareError } = await sbAdmin
    .from('task_shares')
    .select('permission')
    .eq('task_id', taskId)
    .eq('shared_with_user_id', userId)
    .maybeSingle();

  if (directShareError) {
    console.error('Error checking direct task share:', directShareError);
    return false;
  }

  if (directShare) {
    return true;
  }

  // Fallback: check email-based share if we have a verified email.
  if (email) {
    const { data: emailShare, error: emailShareError } = await sbAdmin
      .from('task_shares')
      .select('permission')
      .eq('task_id', taskId)
      .ilike('shared_with_email', email)
      .maybeSingle();

    if (emailShareError) {
      console.error('Error checking email-based task share:', emailShareError);
      return false;
    }

    if (emailShare) {
      return true;
    }
  }

  const { data: publicShare } = await sbAdmin
    .from('task_share_links')
    .select('id')
    .eq('task_id', taskId)
    .eq('public_access', 'view')
    .eq('requires_invite', false)
    .maybeSingle();

  return !!publicShare;
}

async function resolveSignedUrl(
  request: Request,
  params: Promise<{ wsId: string }>,
  input: { path: string; expiresIn?: number; taskId?: string }
) {
  const { wsId } = await params;
  const supabase = await createClient(request);
  const sbAdmin = await createAdminClient();

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

  const sanitizedPath = sanitizePath(input.path);
  if (!sanitizedPath) {
    return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
  }

  if (!sanitizedPath.startsWith('task-images/')) {
    return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
  }

  if (!permissions) {
    if (!input.taskId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const taskRoot = `task-images/${input.taskId}`;
    const taskPrefix = `${taskRoot}/`;
    if (sanitizedPath !== taskRoot && !sanitizedPath.startsWith(taskPrefix)) {
      return NextResponse.json({ message: 'Invalid path' }, { status: 400 });
    }

    const hasAccess = await hasSharedTaskAccess({
      normalizedWsId,
      taskId: input.taskId,
      userId: user.id,
      sbAdmin,
    });

    if (!hasAccess) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
  }

  const sbStorageAdmin = await createDynamicAdminClient();
  const storagePath = `${normalizedWsId}/${sanitizedPath}`;
  const expiresIn = input.expiresIn ?? 31_536_000;

  const { data, error } = await sbStorageAdmin.storage
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
      taskId: searchParams.get('taskId') ?? undefined,
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
