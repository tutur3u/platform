import { type NextRequest, NextResponse } from 'next/server';
import { getHiveServer, updateHiveOllamaState } from '@/lib/hive/hive-db';
import { type HiveOllamaAction, runHiveOllamaAction } from '@/lib/hive/ollama';
import {
  mapHiveServer,
  requireHiveAdmin,
  withHiveRoute,
} from '../../../_shared';

const ROUTE = '/api/v1/hive/servers/[serverId]/ollama';

type Params = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;

  return withHiveRoute(request, ROUTE, async () => {
    const result = await requireHiveAdmin(request);
    if (!result.ok) return result.response;

    const server = await getHiveServer(serverId);
    const settings = server?.settings;
    const settingsObject =
      settings && typeof settings === 'object' && !Array.isArray(settings)
        ? (settings as Record<string, unknown>)
        : {};

    if (!server || settingsObject.ollamaEnabled !== true) {
      return NextResponse.json(
        { error: 'Hive Ollama is disabled for this server' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : 'status';

    if (!['generate', 'load', 'status', 'unload'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid Hive Ollama action' },
        { status: 400 }
      );
    }

    const response = await runHiveOllamaAction({
      action: action as HiveOllamaAction,
      keepAlive:
        typeof settingsObject.ollamaKeepAlive === 'string'
          ? settingsObject.ollamaKeepAlive
          : undefined,
      prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
    });
    const nextServer = await updateHiveOllamaState(serverId, {
      lastAction: action,
      lastStatus: response.ok ? 'ok' : 'error',
      loaded: action === 'unload' ? false : action === 'load' || undefined,
      model: 'gemma4',
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: response.ok,
      ollama: response,
      server: nextServer ? mapHiveServer(nextServer) : null,
    });
  });
}
