import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  generateProfileLinkCode,
  PROFILE_LINK_FIELDS,
} from '@/features/user-profile-links/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{ wsId: string }>;
}

const createSchema = z
  .object({
    mode: z.enum(['per_user', 'generic']),
    target_user_id: z.string().uuid().nullable().optional(),
    allowed_fields: z
      .array(z.enum(PROFILE_LINK_FIELDS))
      .min(1)
      .refine((fields) => new Set(fields).size === fields.length, {
        message: 'allowed_fields must not contain duplicates',
      }),
    expires_at: z.string().datetime({ offset: true }).nullable().optional(),
    max_uses: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (data) =>
      data.mode === 'per_user' ? !!data.target_user_id : !data.target_user_id,
    {
      message:
        'per_user links require target_user_id; generic links must omit it',
      path: ['target_user_id'],
    }
  );

export async function GET(req: Request, { params }: Params) {
  const { wsId } = await params;

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!permissions.containsPermission('manage_user_profile_links')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage profile links' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('workspace_user_profile_links_with_stats')
    .select('*')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (error) {
    serverLogger.error('Error listing profile links:', error);
    return NextResponse.json(
      { message: 'Error listing profile links' },
      { status: 500 }
    );
  }

  return NextResponse.json({ links: data ?? [] });
}

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!permissions.containsPermission('manage_user_profile_links')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage profile links' },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: 'Invalid request body',
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const supabase = await createClient(req);
  const { user: actorUser } = await resolveAuthenticatedSessionUser(supabase);
  if (!actorUser?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient();

  // For per_user links, ensure the target belongs to this workspace.
  if (parsed.data.mode === 'per_user') {
    const { data: target } = await sbAdmin
      .from('workspace_users')
      .select('id')
      .eq('ws_id', wsId)
      .eq('id', parsed.data.target_user_id as string)
      .maybeSingle();

    if (!target) {
      return NextResponse.json(
        { message: 'Target user not found in this workspace' },
        { status: 404 }
      );
    }
  }

  const { data: link, error } = await sbAdmin
    .from('workspace_user_profile_links')
    .insert({
      ws_id: wsId,
      code: generateProfileLinkCode(),
      creator_id: actorUser.id,
      mode: parsed.data.mode,
      target_user_id: parsed.data.target_user_id ?? null,
      allowed_fields: parsed.data.allowed_fields,
      expires_at: parsed.data.expires_at ?? null,
      max_uses: parsed.data.max_uses ?? null,
    })
    .select('id, code')
    .single();

  if (error || !link) {
    serverLogger.error('Error creating profile link:', error);
    return NextResponse.json(
      { message: 'Error creating profile link' },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: link.id, code: link.code }, { status: 201 });
}
