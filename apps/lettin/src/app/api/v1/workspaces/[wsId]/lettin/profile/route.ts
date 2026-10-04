import { connection } from 'next/server';
import { bindings } from '@/server/bindings';
import { LettinError } from '@/server/context';
import {
  creatorAboutSchema,
  readCreatorAbout,
  saveCreatorAbout,
} from '@/server/creator-about';
import { boundedBody, handle, respond } from '@/server/http';
import { resolveActor } from '@/server/identity';
import { withinLettinDepth } from '@/server/schema';

type Context = { params: Promise<{ wsId: string }> };
export function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    await connection();
    const actor = await resolveActor((await params).wsId);
    return respond(await readCreatorAbout((await bindings()).db, actor.id));
  });
}
export function POST(request: Request, { params }: Context) {
  return handle(async () => {
    const actor = await resolveActor((await params).wsId);
    let body: unknown;
    try {
      body = JSON.parse(
        new TextDecoder().decode(await boundedBody(request, 150000))
      );
    } catch (error) {
      if (error instanceof LettinError) throw error;
      throw new LettinError(400);
    }
    if (!withinLettinDepth(body)) throw new LettinError(400);
    const parsed = creatorAboutSchema.safeParse(body);
    if (!parsed.success) throw new LettinError(400);
    return respond(
      await saveCreatorAbout((await bindings()).db, actor, parsed.data)
    );
  });
}
