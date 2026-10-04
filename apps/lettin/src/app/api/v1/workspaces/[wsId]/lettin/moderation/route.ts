import { connection } from 'next/server';
import { bindings } from '@/server/bindings';
import { LettinError } from '@/server/context';
import { boundedBody, handle, respond } from '@/server/http';
import { resolveActor } from '@/server/identity';
import {
  moderationCommandSchema,
  mutateBlacklist,
  readBlacklist,
} from '@/server/moderation';

type Context = { params: Promise<{ wsId: string }> };
export function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    await connection();
    const actor = await resolveActor((await params).wsId);
    return respond(await readBlacklist((await bindings()).db, actor));
  });
}
export function POST(request: Request, { params }: Context) {
  return handle(async () => {
    const actor = await resolveActor((await params).wsId);
    let body: unknown;
    try {
      body = JSON.parse(
        new TextDecoder().decode(await boundedBody(request, 12000))
      );
    } catch (error) {
      if (error instanceof LettinError) throw error;
      throw new LettinError(400);
    }
    const command = moderationCommandSchema.safeParse(body);
    if (!command.success) throw new LettinError(400);
    return respond(
      await mutateBlacklist((await bindings()).db, actor, command.data)
    );
  });
}
