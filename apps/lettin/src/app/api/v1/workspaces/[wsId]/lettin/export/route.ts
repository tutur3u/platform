import { connection } from 'next/server';
import { z } from 'zod';
import { bindings } from '@/server/bindings';
import { LettinError } from '@/server/context';
import { handle, respond } from '@/server/http';
import { resolveActor } from '@/server/identity';
import { exportNotebook } from '@/server/notebook-export';

const input = z
  .object({
    worldId: z.guid(),
    scope: z.enum(['published', 'draft']).default('published'),
    privateConsent: z.enum(['0', '1']).default('0'),
    expectedActor: z.guid(),
  })
  .strict();
export function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  return handle(async () => {
    await connection();
    const actor = await resolveActor((await params).wsId);
    const query = new URL(request.url).searchParams;
    for (const key of query.keys())
      if (query.getAll(key).length !== 1) throw new LettinError(400);
    const parsed = input.safeParse(Object.fromEntries(query));
    if (!parsed.success) throw new LettinError(400);
    if (parsed.data.expectedActor !== actor.id)
      throw new LettinError(409, 'Account changed');
    const { db } = await bindings();
    const result = await exportNotebook(
      db,
      actor,
      parsed.data.worldId,
      parsed.data.scope,
      parsed.data.privateConsent === '1'
    );
    const response = respond(result);
    response.headers.set(
      'Content-Disposition',
      'attachment; filename="lettin-notebook.json"'
    );
    return response;
  });
}
