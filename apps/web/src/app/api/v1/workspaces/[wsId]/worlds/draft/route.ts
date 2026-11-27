import { connection } from 'next/server';
import {
  authorizeDraft,
  type DraftResult,
  readDraft,
  writeDraft,
} from '@/lib/worlds/draft-store';

type Context = { params: Promise<{ wsId: string }> };
const maxBodyBytes = 64 * 1024;

function respond(result: DraftResult) {
  const status = {
    ok: 200,
    stale: 409,
    forbidden: 403,
    invalid: 400,
    unavailable: 503,
  };
  return Response.json(result, {
    status: status[result.status],
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function GET(request: Request, { params }: Context) {
  await connection();
  const wsId = await authorizeDraft((await params).wsId, request);
  return respond(wsId ? await readDraft(wsId) : { status: 'forbidden' });
}

export async function PUT(request: Request, { params }: Context) {
  const wsId = await authorizeDraft((await params).wsId, request);
  if (!wsId) return respond({ status: 'forbidden' });

  const reader = request.body?.getReader();
  if (!reader) return respond({ status: 'invalid' });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let body = '';
  let input: unknown;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBodyBytes) {
        await reader.cancel();
        return respond({ status: 'invalid' });
      }
      body += decoder.decode(value, { stream: true });
    }
    input = JSON.parse(body + decoder.decode());
  } catch {
    return respond({ status: 'invalid' });
  } finally {
    reader.releaseLock();
  }
  return respond(await writeDraft(wsId, input));
}
