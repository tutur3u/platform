import type { LettinDraft, LettinNode } from '@tuturuuu/internal-api/lettin';
export function referenceIds(draft: LettinDraft) {
  return [
    ...new Set([
      ...draft.links,
      ...(draft.wiki?.relationships.map((relation) => relation.targetId) ?? []),
    ]),
  ];
}
export function draftArtwork(draft: LettinDraft, worldId: string) {
  const images = new Set([
    draft.image,
    ...(draft.gallery?.map((item) => item.image) ?? []),
  ]);
  const visit = (node: LettinNode) => {
    if (typeof node.attrs?.src === 'string') images.add(node.attrs.src);
    node.content?.forEach(visit);
  };
  visit(draft.content);
  return {
    sql: `NOT EXISTS(SELECT 1 FROM json_each(?) image WHERE image.value LIKE '/api/v1/lettin/media/%' AND NOT EXISTS(SELECT 1 FROM media m WHERE m.id=substr(image.value,length('/api/v1/lettin/media/')+1) AND m.world_id=? AND m.deleting=0))`,
    values: [JSON.stringify([...images]), worldId],
  };
}
export function publishedReferences(
  draft: LettinDraft,
  ids: Set<string>
): LettinDraft {
  return {
    ...draft,
    links: (draft.links ?? []).filter((id) => ids.has(id)),
    ...(draft.wiki
      ? {
          wiki: {
            ...draft.wiki,
            relationships: draft.wiki.relationships.filter((relation) =>
              ids.has(relation.targetId)
            ),
          },
        }
      : {}),
  };
}
