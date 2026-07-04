import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { normalizeAvatarImageSrc } from '@tuturuuu/utils/avatar-url';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{ wsId: string }>;
}

interface WorkspaceUserSearchRow {
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

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed)) return 20;
  return Math.min(Math.max(parsed, 1), 50);
}

function sanitizeUser(
  row: WorkspaceUserSearchRow,
  canViewPrivateInfo: boolean
) {
  return {
    id: row.id,
    display_name: row.display_name,
    full_name: row.full_name,
    avatar_url: normalizeAvatarImageSrc(row.avatar_url) ?? null,
    email: canViewPrivateInfo ? row.email : null,
    phone: canViewPrivateInfo ? row.phone : null,
    birthday: canViewPrivateInfo ? row.birthday : null,
    gender: canViewPrivateInfo ? row.gender : null,
    archived: row.archived,
    private_fields_hidden: !canViewPrivateInfo,
  };
}

export async function GET(req: NextRequest, { params }: Params) {
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
  const limit = parseLimit(req.nextUrl.searchParams.get('limit'));
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .rpc('get_workspace_users', {
      _ws_id: wsId,
      included_groups: [],
      excluded_groups: [],
      search_query: q,
      include_archived: true,
      link_status: 'all',
    })
    .select(
      'id, display_name, full_name, avatar_url, email, phone, birthday, gender, archived'
    )
    .order('full_name', { ascending: true, nullsFirst: false })
    .order('display_name', { ascending: true, nullsFirst: false })
    .range(0, limit - 1);

  if (error) {
    console.error('Error searching profile link target users:', error);
    return NextResponse.json(
      { message: 'Error searching users' },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as WorkspaceUserSearchRow[];

  return NextResponse.json({
    data: rows.map((row) => sanitizeUser(row, canViewPrivateInfo)),
  });
}
