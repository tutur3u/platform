import { connection } from 'next/server';
import { z } from 'zod';
import { bindings } from '@/server/bindings';
import { LettinError } from '@/server/context';
import { handle, respond } from '@/server/http';
import { readPublic } from '@/server/queries';
export function GET(request: Request) {
  return handle(async () => {
    await connection();
    const query = new URL(request.url).searchParams;
    const world = query.get('worldId');
    const parsed = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        creatorId: z.guid().optional(),
        search: z.string().max(200).optional(),
      })
      .safeParse({
        page: query.get('page') ?? undefined,
        creatorId: query.get('creatorId') ?? undefined,
        search: query.get('q') ?? undefined,
      });
    if (!parsed.success) throw new LettinError(400);
    if (world && !z.guid().safeParse(world).success) throw new LettinError(400);
    return respond(
      await readPublic((await bindings()).db, world ?? undefined, parsed.data)
    );
  });
}
