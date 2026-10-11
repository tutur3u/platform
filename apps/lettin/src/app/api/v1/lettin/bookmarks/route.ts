import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { connection } from 'next/server';
import { z } from 'zod';
import { bindings } from '@/server/bindings';
import { LettinError } from '@/server/context';
import { boundedBody, handle, respond } from '@/server/http';
import {
  notebookSaved,
  savedNotebooks,
  setNotebookSaved,
} from '@/server/reader-bookmarks';

const command = z
  .object({ worldId: z.guid(), saved: z.boolean(), expectedActor: z.guid() })
  .strict();
async function reader() {
  const user = await getSatelliteAppSessionUser('lettin');
  if (!user) throw new LettinError(401);
  return user.id;
}
export function GET(request: Request) {
  return handle(async () => {
    await connection();
    const actorId = await reader();
    const query = new URL(request.url).searchParams;
    const expectedActor = query.get('expectedActor');
    if (
      query.getAll('expectedActor').length !== 1 ||
      !z.guid().safeParse(expectedActor).success
    )
      throw new LettinError(400);
    if (expectedActor !== actorId)
      throw new LettinError(409, 'Account changed');
    if (query.getAll('worldId').length > 1) throw new LettinError(400);
    const worldId = query.get('worldId');
    if (worldId !== null && !z.guid().safeParse(worldId).success)
      throw new LettinError(400);
    const { db } = await bindings();
    return respond(
      worldId
        ? await notebookSaved(db, actorId, worldId)
        : await savedNotebooks(db, actorId)
    );
  });
}
export function POST(request: Request) {
  return handle(async () => {
    const actorId = await reader();
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      throw new LettinError(403);
    let body: unknown;
    try {
      body = JSON.parse(
        new TextDecoder().decode(await boundedBody(request, 2000))
      );
    } catch (error) {
      if (error instanceof LettinError) throw error;
      throw new LettinError(400);
    }
    const parsed = command.safeParse(body);
    if (!parsed.success) throw new LettinError(400);
    if (parsed.data.expectedActor !== actorId)
      throw new LettinError(409, 'Account changed');
    const { db } = await bindings();
    return respond(
      await setNotebookSaved(
        db,
        actorId,
        parsed.data.worldId,
        parsed.data.saved
      )
    );
  });
}
