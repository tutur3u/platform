import { ArrowUpRight, Compass, Feather, Palette } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { creativeSpaces } from './spaces';

const icons = { art: Palette, story: Feather, world: Compass };

export function CreativeSpaces({
  wsId,
  showHeading = true,
}: {
  wsId?: string;
  showHeading?: boolean;
}) {
  const t = useTranslations('lettin');
  return (
    <section aria-label={t('spaces')} className="creative-spaces">
      {showHeading && (
        <div className="spaces-heading">
          <div>
            <h2 id="spaces-heading">{t('spacesTitle')}</h2>
          </div>
        </div>
      )}
      <div className="spaces-grid">
        {creativeSpaces.map((space) => {
          const Icon = icons[space];
          return (
            <Link
              key={space}
              className={`space-door space-door-for-${space}`}
              href={
                wsId ? `/${wsId}/spaces/${space}` : `/dashboard?space=${space}`
              }
            >
              <div className="space-door-art" aria-hidden="true">
                <span />
                <Icon size={44} strokeWidth={1} />
              </div>
              <div className="space-door-copy">
                <h3>
                  {t(`space${space}Title`)}
                  <ArrowUpRight size={20} />
                </h3>
                <span>{t(`space${space}Hint`)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
