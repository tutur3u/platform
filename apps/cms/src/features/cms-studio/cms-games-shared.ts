import type { ExternalProjectCollection } from '@tuturuuu/types';

export function isGameLikeCollection(
  collection: Pick<
    ExternalProjectCollection,
    'collection_type' | 'slug' | 'title'
  >
) {
  return /game|webgl|playable/i.test(
    [collection.slug, collection.collection_type, collection.title]
      .filter(Boolean)
      .join(' ')
  );
}
