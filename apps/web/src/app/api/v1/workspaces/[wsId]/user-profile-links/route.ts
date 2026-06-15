import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { normalizeAvatarImageSrc } from '@tuturuuu/utils/avatar-url';
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

interface WorkspaceUserProfileLinkRow {
  id: string;
  code: string;
  mode: 'per_user' | 'generic';
  target_user_id: string | null;
  allowed_fields: string[];
  prefill_existing_values?: boolean | null;
  max_uses: number | null;
  expires_at: string | null;
  current_uses: number;
  is_expired: boolean;
  is_full: boolean;
  is_revoked: boolean;
  created_at: string;
}

interface TargetUserRow {
  id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  birthday: string | null;
  gender: string | null;
  archived: boolean | null;
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
    prefill_existing_values: z.boolean().optional(),
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
  const canViewPrivateInfo = permissions.containsPermission(
    'view_users_private_info'
  );

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

  const rows = (data ?? []) as WorkspaceUserProfileLinkRow[];
  const targetUserIds = Array.from(
    new Set(
      rows
        .map((link) => link.target_user_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );
  const targetUsersById = new Map<string, TargetUserRow>();

  if (targetUserIds.length > 0) {
    const { data: targetUsers, error: targetUsersError } = await sbAdmin
      .from('workspace_users')
      .select(
        'id, display_name, full_name, avatar_url, email, phone, birthday, gender, archived'
      )
      .eq('ws_id', wsId)
      .in('id', targetUserIds);

    if (targetUsersError) {
      serverLogger.error('Error loading profile link target users:', {
        error: targetUsersError,
      });
      return NextResponse.json(
        { message: 'Error listing profile links' },
        { status: 500 }
      );
    }

    for (const targetUser of (targetUsers ?? []) as TargetUserRow[]) {
      targetUsersById.set(targetUser.id, targetUser);
    }
  }

  const links = rows.map((link) => {
    const targetUser = link.target_user_id
      ? targetUsersById.get(link.target_user_id)
      : null;

    return {
      ...link,
      prefill_existing_values: link.prefill_existing_values ?? true,
      target_user: targetUser
        ? {
            id: targetUser.id,
            display_name: targetUser.display_name,
            full_name: targetUser.full_name,
            avatar_url: normalizeAvatarImageSrc(targetUser.avatar_url) ?? null,
            email: canViewPrivateInfo ? targetUser.email : null,
            phone: canViewPrivateInfo ? targetUser.phone : null,
            birthday: canViewPrivateInfo ? targetUser.birthday : null,
            gender: canViewPrivateInfo ? targetUser.gender : null,
            archived: targetUser.archived,
            private_fields_hidden: !canViewPrivateInfo,
          }
        : null,
    };
  });

  return NextResponse.json({ links });
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
      prefill_existing_values: parsed.data.prefill_existing_values ?? true,
      expires_at: parsed.data.expires_at ?? null,
      max_uses: parsed.data.max_uses ?? null,
    } as never)
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
