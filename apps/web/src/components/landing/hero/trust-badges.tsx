import { useTranslations } from 'next-intl';

/**
 * Spec strip under the hero product frame.
 *
 * Reads as instrument labelling — hairline separators, monospace, wide
 * tracking — rather than a row of checkmark chips.
 */
export function TrustBadges() {
  const t = useTranslations('landing.hero.trust');

  const badges = [
    t('openSource'),
    t('commits'),
    t('contributors'),
    t('free'),
  ] as const;

  return (
    <div className="mt-14 border-foreground/[0.08] border-y">
      <dl className="grid grid-cols-2 divide-x divide-y divide-foreground/[0.08] sm:grid-cols-4 sm:divide-y-0">
        {badges.map((label, index) => (
          <div
            className="flex items-center justify-center px-3 py-4 sm:py-5"
            key={label}
          >
            <dt className="sr-only">{index + 1}</dt>
            <dd className="text-center font-mono-ui text-[0.68rem] text-foreground/45 uppercase tracking-[0.16em] transition-colors duration-300 hover:text-foreground/70">
              {label}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
