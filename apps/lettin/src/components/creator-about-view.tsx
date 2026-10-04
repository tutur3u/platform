import type { LettinCreatorAbout } from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';
import { renderDocumentNode } from './document-nodes';
export function CreatorAboutView({ details }: { details: LettinCreatorAbout }) {
  const t = useTranslations('lettin');
  return (
    <section className="notebook-paper wiki-document space-y-5 p-6">
      {details.headline && <h2 className="text-2xl">{details.headline}</h2>}
      {(details.pronouns || details.location) && (
        <p className="text-muted-foreground text-sm">
          {[details.pronouns, details.location].filter(Boolean).join(' · ')}
        </p>
      )}
      {!!details.interests.length && (
        <ul className="flex flex-wrap gap-2" aria-label={t('creatorInterests')}>
          {details.interests.map((interest, index) => (
            <li
              className="rounded-full border px-3 py-1 text-sm"
              key={`${interest}-${index}`}
            >
              {interest}
            </li>
          ))}
        </ul>
      )}
      <div className="notebook-prose">
        {renderDocumentNode(details.content, 0, {
          completed: t('completedTask'),
          incomplete: t('incompleteTask'),
        })}
      </div>
      {!!details.links.length && (
        <nav className="flex flex-wrap gap-4" aria-label={t('creatorLinks')}>
          {details.links
            .filter((link) => link.url.startsWith('https://'))
            .map((link, index) => (
              <a
                className="underline underline-offset-4"
                key={`${link.url}-${index}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            ))}
        </nav>
      )}
    </section>
  );
}
