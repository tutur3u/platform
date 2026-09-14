import { connection } from 'next/server';
import { bindings } from '@/server/bindings';
import { type PublicFilters, readPublic } from '@/server/queries';
export async function publicWorlds(world?: string, filters?: PublicFilters) {
  await connection();
  return readPublic((await bindings()).db, world, filters);
}
