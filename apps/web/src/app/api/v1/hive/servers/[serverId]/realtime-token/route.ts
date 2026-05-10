import { type NextRequest, NextResponse } from 'next/server';
import {
  requireHiveAccess,
  signHiveRealtimeToken,
  withHiveRoute,
} from '../../../_shared';

const ROUTE = '/api/v1/hive/servers/[serverId]/realtime-token';
const TOKEN_TTL_MS = 15 * 60_000;

type Params = {
  params: Promise<{
    serverId: string;
  }>;
};

async function createToken(request: NextRequest, serverId: string) {
  const result = await requireHiveAccess(request);
  if (!result.ok) return result.response;

  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const token = signHiveRealtimeToken({
    exp: Math.floor(expiresAt.getTime() / 1000),
    role: result.access.isAdmin ? 'admin' : 'member',
    scopes: ['presence', 'world:write', 'npc:write'],
    serverId,
    userId: result.access.user.id,
  });

  return NextResponse.json({
    expiresAt: expiresAt.toISOString(),
    token,
    url:
      process.env.NEXT_PUBLIC_HIVE_REALTIME_URL ||
      process.env.HIVE_REALTIME_URL ||
      '/realtime',
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  return withHiveRoute(request, ROUTE, () => createToken(request, serverId));
}
