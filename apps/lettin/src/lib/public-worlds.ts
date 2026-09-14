import { connection } from 'next/server';
import { bindings } from '@/server/bindings';
import { readPublic } from '@/server/queries';
export async function publicWorlds(world?: string) {
  await connection();
  return readPublic((await bindings()).db, world);
}
