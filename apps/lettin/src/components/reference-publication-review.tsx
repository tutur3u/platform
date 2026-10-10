import type { LettinDraft, LettinRecord } from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';

export function referenceAvailability(
  draft: LettinDraft,
  entries: LettinRecord[]
) {
  const targets = new Map(entries.map((entry) => [entry.id, entry]));
  return [
    ...new Set([
      ...draft.links,
      ...(draft.wiki?.relationships.map((relation) => relation.targetId) ?? []),
    ]),
  ].map((id) => {
    const target = targets.get(id);
    return {
      id,
      title: target?.draft.title,
      state: !target
        ? 'unavailable'
        : target.published
          ? 'published'
          : 'private',
    } as const;
  });
}

// Private creator review only; readers receive the server's filtered projection.
export function ReferencePublicationReview({
  draft,
  entries,
}: {
  draft: LettinDraft;
  entries: LettinRecord[];
}) {
  const t = useTranslations('lettin');
  const references = referenceAvailability(draft, entries);
  if (!references.length) return null;
  return (
    <section
      aria-label={t('referenceReviewTitle')}
      className="my-4 space-y-3 rounded-lg border border-border p-4"
    >
      <h3 className="font-medium">{t('referenceReviewTitle')}</h3>
      <p className="text-muted-foreground text-sm">
        {t('referenceReviewHint')}
      </p>
      <ul className="space-y-2 text-sm">
        {references.map((reference) => (
          <li
            key={reference.id}
            className="flex flex-wrap justify-between gap-2"
          >
            <span>{reference.title ?? t('referenceReviewUnavailable')}</span>
            <span className="text-muted-foreground">
              {t(
                reference.state === 'published'
                  ? 'referenceReviewPublished'
                  : reference.state === 'private'
                    ? 'referenceReviewPrivate'
                    : 'referenceReviewUnavailable'
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
