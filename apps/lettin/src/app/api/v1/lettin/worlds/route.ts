import { connection } from 'next/server';
import { z } from 'zod';
import { bindings } from '@/server/bindings';
import { LettinError } from '@/server/context';
import { handle, respond } from '@/server/http';
import { readPublic } from '@/server/queries';
export function GET(request: Request) {
  return handle(async () => {
    await connection();
    const world = new URL(request.url).searchParams.get('worldId');
    if (world && !z.guid().safeParse(world).success) throw new LettinError(400);
    return respond(await readPublic((await bindings()).db, world ?? undefined));
  });
}
