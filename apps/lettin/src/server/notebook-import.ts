import type { LettinDraft, LettinNode } from '@tuturuuu/internal-api/lettin';
import { z } from 'zod';
import { type Actor, isCreator, LettinError, type Store } from './context';
import type { ImportPlan } from './import-plan';
import { applyImport } from './import-store';
import { exportByteLimit } from './notebook-export';
import { lettinDraftSchema, withinLettinDepth } from './schema';

const exported = z.object({
  format: z.literal('lettin-notebook'),
  version: z.literal(1),
  scope: z.enum(['published', 'draft']),
  exportedAt: z.iso.datetime(),
  world: z.object({ id: z.guid(), document: lettinDraftSchema }),
  entries: z
    .array(z.object({ id: z.guid(), document: lettinDraftSchema }))
    .max(1000),
});
export async function requireNotebookImportAccess(db: Store, actor: Actor) {
  if (!actor.canManage || !(await isCreator(db, actor)))
    throw new LettinError(403);
}
export function buildNotebookImportPlan(
  payload: unknown,
  title: string
): ImportPlan {
  if (!withinLettinDepth(payload)) throw new LettinError(400);
  if (
    new TextEncoder().encode(JSON.stringify(payload)).byteLength >
    exportByteLimit
  )
    throw new LettinError(413);
  const result = exported.safeParse(payload);
  const name = z.string().trim().min(1).max(160).safeParse(title);
  if (!result.success || !name.success) throw new LettinError(400);
  const data = result.data;
  const ids = new Map<string, string>();
  for (const entry of data.entries) {
    if (ids.has(entry.id) || entry.id === data.world.id)
      throw new LettinError(400);
    ids.set(entry.id, crypto.randomUUID());
  }
  // Files carry URLs, not asset bytes or permission to read the source store.
  // Strip images and hyperlink marks before storing any untrusted file content.
  const node = (value: LettinNode): LettinNode => {
    if (['image', 'imageResize'].includes(value.type))
      return {
        type: 'paragraph',
        content: value.attrs?.alt
          ? [{ type: 'text', text: String(value.attrs.alt) }]
          : [],
      };
    const { attrs, ...rest } = value;
    const { src: _src, ...safeAttrs } = attrs ?? {};
    return {
      ...rest,
      attrs: safeAttrs,
      marks: value.marks?.filter((mark) => mark.type !== 'link'),
      content: value.content?.map(node),
    };
  };
  const draft = (value: LettinDraft): LettinDraft => ({
    ...value,
    image: '',
    content: node(value.content),
    links: [
      ...new Set(
        value.links.flatMap((id) => (ids.get(id) ? [ids.get(id)!] : []))
      ),
    ],
    wiki: value.wiki
      ? {
          ...value.wiki,
          relationships: value.wiki.relationships.flatMap((rel) =>
            ids.get(rel.targetId)
              ? [{ ...rel, targetId: ids.get(rel.targetId)! }]
              : []
          ),
        }
      : undefined,
  });
  const plan: ImportPlan = {
    source: 'notebook',
    provenance: {
      worldId: data.world.id,
      scope: data.scope,
      exportedAt: data.exportedAt,
    },
    world: { ...draft(data.world.document), title: name.data },
    entries: data.entries.map((entry) => ({
      id: ids.get(entry.id)!,
      sourceId: entry.id,
      draft: draft(entry.document),
    })),
    blacklist: [],
    skipped: 0,
  };
  // A preview is stored in one D1 row; leave headroom below its row-size limit.
  if (new TextEncoder().encode(JSON.stringify(plan)).byteLength > 1024 * 1024)
    throw new LettinError(413, 'Import preview too large');
  return plan;
}
export async function applyNotebookImport(db: Store, actor: Actor, id: string) {
  await requireNotebookImportAccess(db, actor);
  const preview = await db
    .prepare(
      "SELECT 1 FROM import_previews WHERE id=? AND ws_id=? AND actor_id=? AND json_extract(plan,'$.source')='notebook'"
    )
    .bind(id, actor.wsId, actor.id)
    .first();
  if (!preview) throw new LettinError(404);
  return applyImport(db, actor, id);
}
