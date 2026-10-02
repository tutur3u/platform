import type { LettinDraft } from '@tuturuuu/internal-api/lettin';
export const creativeSpaces = ['art', 'story', 'world'] as const;
export type CreativeSpace = (typeof creativeSpaces)[number];
export function isCreativeSpace(value: string): value is CreativeSpace {
  return creativeSpaces.some((space) => space === value);
}
/** Editable tags keep spaces additive without changing content or access storage. */
export function belongsToSpace(
  draft: Pick<LettinDraft, 'tags'>,
  space: CreativeSpace
) {
  const tags = draft.tags.map((tag) => tag.toLowerCase());
  if (space === 'world')
    return (
      tags.includes('world') ||
      (!tags.includes('art') && !tags.includes('story'))
    );
  return tags.includes(space);
}
