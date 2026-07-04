import { type NextRequest, NextResponse } from 'next/server';
import { createHiveServer, listHiveServers } from '@/lib/hive/hive-db';
import {
  hiveServerSchema,
  mapHiveServer,
  requireHiveAccess,
  requireHiveAdmin,
  slugifyHiveServerName,
  withHiveRoute,
} from '../_shared';

const ROUTE = '/api/v1/hive/servers';

async function listServers(request: NextRequest) {
  const result = await requireHiveAccess(request);
  if (!result.ok) return result.response;

  try {
    const servers = await listHiveServers(result.access.isAdmin);
    return NextResponse.json({
      isAdmin: result.access.isAdmin,
      servers: servers.map(mapHiveServer),
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to list Hive servers' },
      { status: 500 }
    );
  }
}

async function createServer(request: NextRequest) {
  const result = await requireHiveAdmin(request);
  if (!result.ok) return result.response;

  const body = await request.json().catch(() => null);
  const parsed = hiveServerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid Hive server payload' },
      { status: 400 }
    );
  }

  const slug = slugifyHiveServerName(parsed.data.name);
  const server = await createHiveServer({
    createdBy: result.access.user.id,
    description: parsed.data.description ?? null,
    enabled: parsed.data.enabled,
    maxPlayers: parsed.data.maxPlayers,
    name: parsed.data.name,
    slug,
  });

  if (!server) {
    return NextResponse.json(
      { error: 'Failed to create Hive server' },
      { status: 400 }
    );
  }

  return NextResponse.json({ server: mapHiveServer(server) }, { status: 201 });
}

export async function GET(request: NextRequest) {
  return withHiveRoute(request, ROUTE, () => listServers(request));
}

export async function POST(request: NextRequest) {
  return withHiveRoute(request, ROUTE, () => createServer(request));
}
