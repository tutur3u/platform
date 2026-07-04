import { type NextRequest, NextResponse } from 'next/server';
import {
  getHiveAccessRequestByUserId,
  getHiveMemberByUserId,
  upsertHiveAccessRequest,
} from '@/lib/hive/hive-db';
import {
  hiveAccessRequestSchema,
  mapHiveAccessRequest,
  mapHiveMember,
  resolveHiveRequestUser,
  withHiveRoute,
} from '../../_shared';

export async function GET(request: NextRequest) {
  return withHiveRoute(request, '/api/v1/hive/access-requests/me', async () => {
    const resolved = await resolveHiveRequestUser(request);

    if (resolved.error || !resolved.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [member, accessRequest] = await Promise.all([
      getHiveMemberByUserId(resolved.user.id),
      getHiveAccessRequestByUserId(resolved.user.id),
    ]);
    const hasAccess = member?.enabled === true;

    return NextResponse.json({
      hasAccess,
      member: member ? mapHiveMember(member) : null,
      request: accessRequest ? mapHiveAccessRequest(accessRequest) : null,
      status: hasAccess ? 'approved' : (accessRequest?.status ?? 'none'),
    });
  });
}

export async function POST(request: NextRequest) {
  return withHiveRoute(request, '/api/v1/hive/access-requests/me', async () => {
    const resolved = await resolveHiveRequestUser(request);

    if (resolved.error || !resolved.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = hiveAccessRequestSchema.parse(await request.json());
    const member = await getHiveMemberByUserId(resolved.user.id);

    if (member?.enabled) {
      return NextResponse.json({
        hasAccess: true,
        member: mapHiveMember(member),
        request: null,
        status: 'approved',
      });
    }

    const accessRequest = await upsertHiveAccessRequest({
      email: resolved.user.email ?? null,
      note: payload.note ?? null,
      userId: resolved.user.id,
    });

    if (!accessRequest) {
      return NextResponse.json(
        { error: 'Failed to request Hive access' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      hasAccess: false,
      member: null,
      request: mapHiveAccessRequest(accessRequest),
      status: accessRequest.status,
    });
  });
}
