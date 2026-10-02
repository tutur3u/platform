import { EXOCORPSE_WORKSPACE_ID } from '@tuturuuu/internal-api/lettin';
import { readExocorpseWikiSource } from '@tuturuuu/internal-api/lettin-server';
import { z } from 'zod';
import { bindings } from '@/server/bindings';
import { LettinError } from '@/server/context';
import { boundedBody, handle, respond } from '@/server/http';
import { resolveActor } from '@/server/identity';
import {
  requireExocorpseSourceAccess,
  requireImportAccess,
} from '@/server/import-access';
import { prepareImportMedia } from '@/server/import-media';
import { buildImportPlan } from '@/server/import-plan';
import { applyImport, previewImport } from '@/server/import-store';
import { withinLettinDepth } from '@/server/schema';

const commandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('preview'),
    title: z.string().trim().min(1).max(160),
    source: z.enum(['cms', 'file']),
    payload: z.unknown().optional(),
  }),
  z.object({ action: z.literal('apply'), previewId: z.guid() }),
]);
export function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  return handle(async () => {
    const actor = await resolveActor((await params).wsId);
    const { db, media } = await bindings();
    await requireImportAccess(db, actor);
    let raw: unknown;
    try {
      raw = JSON.parse(
        new TextDecoder().decode(await boundedBody(request, 8_000_000))
      );
    } catch (error) {
      if (error instanceof LettinError) throw error;
      throw new LettinError(400);
    }
    if (!withinLettinDepth(raw)) throw new LettinError(400);
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) throw new LettinError(400);
    const command = parsed.data;
    if (command.action === 'apply')
      return respond(
        await applyImport(
          db,
          actor,
          command.previewId,
          async (worldId, plan) => {
            if (
              plan.source === 'cms' ||
              JSON.stringify(plan).includes(
                `/api/v1/workspaces/${EXOCORPSE_WORKSPACE_ID}/external-projects/assets/`
              )
            )
              await requireExocorpseSourceAccess(actor);
            return prepareImportMedia(media, actor, worldId, plan);
          }
        )
      );
    if (command.source === 'cms') await requireExocorpseSourceAccess(actor);
    const payload =
      command.source === 'cms'
        ? await readExocorpseWikiSource()
        : command.payload;
    return respond(
      await previewImport(db, actor, {
        ...buildImportPlan(payload, command.title),
        source: command.source,
      })
    );
  });
}
