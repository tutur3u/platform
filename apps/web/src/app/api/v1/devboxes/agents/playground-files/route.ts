import { savePlaygroundRunnerFiles } from '@tuturuuu/storage-core/playground-service';
import { AccountServiceError } from '@tuturuuu/utils/account-benefits-server';
import {
  PlaygroundFiles,
  PlaygroundPath,
} from '@tuturuuu/utils/playground-schema';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeDevboxAgent } from '@/lib/devboxes/agent-auth';
import {
  createDevboxAgentApiDisabledResponse,
  isDevboxAgentApiEnabled,
} from '@/lib/devboxes/agent-traffic-gate';

const schema = z
  .object({
    runId: z.guid(),
    files: PlaygroundFiles,
    paths: z.array(PlaygroundPath).max(128),
  })
  .strict();
export async function POST(request: Request) {
  if (!isDevboxAgentApiEnabled()) return createDevboxAgentApiDisabledResponse();
  const auth = await authorizeDevboxAgent(request, { requireOnline: true });
  if (!auth.ok) return auth.response;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 3 * 1024 * 1024)
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Invalid files' }, { status: 400 });
    return NextResponse.json(
      await savePlaygroundRunnerFiles(
        auth.runner.id,
        parsed.data.runId,
        parsed.data.files,
        parsed.data.paths
      ),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Drive save failed' },
      { status: error instanceof AccountServiceError ? error.status : 500 }
    );
  }
}
