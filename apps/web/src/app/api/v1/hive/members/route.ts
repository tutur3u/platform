import { type NextRequest, NextResponse } from 'next/server';
import { listHiveMembers, upsertHiveMember } from '@/lib/hive/hive-db';
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

    try {
      const members = await listHiveMembers();
      return NextResponse.json({ members: members.map(mapHiveMember) });
    } catch {
      return NextResponse.json(
        { error: 'Failed to list Hive members' },
        { status: 500 }
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return withHiveRoute(request, '/api/v1/hive/members', async () => {
    const access = await requireHiveAdmin(request);

    if (!access.ok) {
      return access.response;
    }

    const payload = hiveMemberSchema.parse(await request.json());
    const member = await upsertHiveMember({
      enabled: payload.enabled,
      notes: payload.notes ?? null,
      userId: payload.userId,
    });

    if (!member) {
      return NextResponse.json(
        { error: 'Failed to update Hive member' },
        { status: 500 }
      );
    }

    return NextResponse.json({ member: mapHiveMember(member) });
  });
}
