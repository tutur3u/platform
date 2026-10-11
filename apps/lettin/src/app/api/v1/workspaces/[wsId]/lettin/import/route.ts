import { z } from 'zod';
import { bindings } from '@/server/bindings';
import { LettinError } from '@/server/context';
import { boundedBody, handle, respond } from '@/server/http';
import { resolveActor } from '@/server/identity';
import { previewImport } from '@/server/import-store';
import {
  applyNotebookImport,
  buildNotebookImportPlan,
  requireNotebookImportAccess,
} from '@/server/notebook-import';
import { withinLettinDepth } from '@/server/schema';

const command = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('preview'),
      expectedActor: z.guid(),
      title: z.string().trim().min(1).max(160),
      payload: z.unknown(),
      consent: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal('apply'),
      expectedActor: z.guid(),
      previewId: z.guid(),
      consent: z.literal(true),
    })
    .strict(),
]);
export function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  return handle(async () => {
    if (request.headers.get('origin') !== new URL(request.url).origin)
      throw new LettinError(403);
    const actor = await resolveActor((await params).wsId);
    let raw: unknown;
    try {
      raw = JSON.parse(
        new TextDecoder().decode(await boundedBody(request, 11 * 1024 * 1024))
      );
    } catch (error) {
      if (error instanceof LettinError) throw error;
      throw new LettinError(400);
    }
    if (!withinLettinDepth(raw)) throw new LettinError(400);
    const parsed = command.safeParse(raw);
    if (!parsed.success) throw new LettinError(400);
    const input = parsed.data;
    if (input.expectedActor !== actor.id)
      throw new LettinError(409, 'Account changed');
    const { db } = await bindings();
    await requireNotebookImportAccess(db, actor);
    return respond(
      input.action === 'apply'
        ? await applyNotebookImport(db, actor, input.previewId)
        : await previewImport(
            db,
            actor,
            buildNotebookImportPlan(input.payload, input.title)
          )
    );
  });
}
