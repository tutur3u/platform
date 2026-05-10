import { type NextRequest, NextResponse } from 'next/server';
import {
  hiveMemberSchema,
  mapHiveMember,
  requireHiveAdmin,
  withHiveRoute,
} from '../_shared';

export async function GET(request: NextRequest) {
  return withHiveRoute(request, '/api/v1/hive/members', async () => {
    const access = await requireHiveAdmin(request);

    if (!access.ok) {
      return access.response;
    }

    const { data, error } = await access.access.sbAdmin
      .from('hive_members')
      .select('id, user_id, enabled, notes, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to list Hive members' },
        { status: 500 }
      );
    }

    return NextResponse.json({ members: (data ?? []).map(mapHiveMember) });
  });
}

export async function POST(request: NextRequest) {
  return withHiveRoute(request, '/api/v1/hive/members', async () => {
    const access = await requireHiveAdmin(request);

    if (!access.ok) {
      return access.response;
    }

    const payload = hiveMemberSchema.parse(await request.json());
    const { data, error } = await access.access.sbAdmin
      .from('hive_members')
      .upsert(
        {
          enabled: payload.enabled,
          notes: payload.notes ?? null,
          updated_at: new Date().toISOString(),
          user_id: payload.userId,
        },
        { onConflict: 'user_id' }
      )
      .select('id, user_id, enabled, notes, created_at')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to update Hive member' },
        { status: 500 }
      );
    }

    return NextResponse.json({ member: mapHiveMember(data) });
  });
}
