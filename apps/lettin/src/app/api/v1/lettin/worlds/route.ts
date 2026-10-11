import { connection } from 'next/server';
import { z } from 'zod';
import { bindings } from '@/server/bindings';
import { LettinError } from '@/server/context';
import { handle, respond } from '@/server/http';
import { publicCatalogueFiltersSchema } from '@/server/public-catalogue-filters';
import { readPublic } from '@/server/queries';
export function GET(request: Request) {
  return handle(async () => {
    await connection();
    const query = new URL(request.url).searchParams;
    const world = query.get('worldId');
    const parsed = publicCatalogueFiltersSchema.safeParse({
      page: query.get('page') ?? undefined,
      creatorId: query.get('creatorId') ?? undefined,
      search: query.get('q') ?? undefined,
      tag:
        query.getAll('tag').length > 1
          ? query.getAll('tag')
          : (query.get('tag') ?? undefined),
    });
    if (!parsed.success) throw new LettinError(400);
    if (world && !z.guid().safeParse(world).success) throw new LettinError(400);
    return respond(
      await readPublic((await bindings()).db, world ?? undefined, parsed.data)
    );
  });
}
