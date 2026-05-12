import { type NextRequest, NextResponse } from 'next/server';
import {
  requireHiveAccess,
  serverLogger,
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
  let token: string;

  try {
    token = signHiveRealtimeToken({
      exp: Math.floor(expiresAt.getTime() / 1000),
      role: result.access.isAdmin ? 'admin' : 'member',
      scopes: ['presence', 'world:write', 'npc:write'],
      serverId,
      userId: result.access.user.id,
    });
  } catch (error) {
    serverLogger.error('Failed to sign Hive realtime token', {
      error: error instanceof Error ? error.message : String(error),
      serverId,
    });

    return NextResponse.json(
      { error: 'Hive realtime token signing is not configured' },
      { status: 503 }
    );
  }

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
