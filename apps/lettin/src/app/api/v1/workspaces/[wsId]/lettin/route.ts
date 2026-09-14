import { connection } from 'next/server';
import { z } from 'zod';
import { bindings } from '@/server/bindings';
import { LettinError } from '@/server/context';
import { boundedBody, handle, respond } from '@/server/http';
import { resolveActor } from '@/server/identity';
import { mutate } from '@/server/mutations';
import { readOverview, readWorld } from '@/server/queries';
import { lettinCommandSchema, withinLettinDepth } from '@/server/schema';

type Context = { params: Promise<{ wsId: string }> };
export function GET(request: Request, { params }: Context) {
  return handle(async () => {
    await connection();
    const actor = await resolveActor((await params).wsId);
    const worldId = new URL(request.url).searchParams.get('worldId');
    if (worldId && !z.guid().safeParse(worldId).success)
      throw new LettinError(400);
    const { db } = await bindings();
    return respond(
      worldId
        ? await readWorld(db, actor, worldId)
        : await readOverview(db, actor)
    );
  });
}
export function POST(request: Request, { params }: Context) {
  return handle(async () => {
    const actor = await resolveActor((await params).wsId);
    const text = new TextDecoder().decode(await boundedBody(request, 300000));
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new LettinError(400, 'Invalid JSON');
    }
    if (!withinLettinDepth(body))
      throw new LettinError(400, 'Document too deep');
    const parsed = lettinCommandSchema.safeParse(body);
    if (!parsed.success) throw new LettinError(400, 'Invalid input');
    const { db } = await bindings();
    return respond(await mutate(db, actor, parsed.data));
  });
}
