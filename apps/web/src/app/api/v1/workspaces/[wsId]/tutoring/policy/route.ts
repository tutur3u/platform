import {
  parseTutoringPolicy,
  readTutoringPolicy,
  TUTORING_POLICY_CONFIG_ID,
} from '@tuturuuu/internal-api/tutoring-policy';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { resolveTutoringRouteAccess } from '@/lib/tutoring/route-access';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  await connection();
  const { wsId } = await params;
  const { normalizedWsId, permissions } = await resolveTutoringRouteAccess(
    request,
    wsId
  );
  if (!permissions)
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (permissions.withoutPermission('view_user_groups'))
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from('workspace_configs')
    .select('value')
    .eq('ws_id', normalizedWsId)
    .eq('id', TUTORING_POLICY_CONFIG_ID)
    .maybeSingle();
  if (error) {
    console.error('Failed to load tutoring policy', error);
    return NextResponse.json(
      { message: 'Failed to load tutoring policy' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      policy: readTutoringPolicy(data?.value),
      isConfigured: Boolean(data?.value),
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

export async function PUT(request: Request, { params }: Params) {
  const { wsId } = await params;
  const { normalizedWsId, permissions } = await resolveTutoringRouteAccess(
    request,
    wsId
  );
  if (!permissions)
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (permissions.withoutPermission('manage_workspace_settings'))
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const policy = parseTutoringPolicy(body);
  if (!policy)
    return NextResponse.json(
      { message: 'Invalid tutoring policy' },
      { status: 400 }
    );

  const admin = await createAdminClient();
  const { error } = await admin.from('workspace_configs').upsert({
    id: TUTORING_POLICY_CONFIG_ID,
    ws_id: normalizedWsId,
    value: JSON.stringify(policy),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error('Failed to save tutoring policy', error);
    return NextResponse.json(
      { message: 'Failed to save tutoring policy' },
      { status: 500 }
    );
  }
  return NextResponse.json({ policy });
}
