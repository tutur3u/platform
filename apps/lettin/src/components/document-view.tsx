import type { LettinDraft } from '@tuturuuu/internal-api/lettin';
import { useTranslations } from 'next-intl';
import { ArtworkGallery } from './artwork-gallery';

import { ContentNotice } from './content-notice';
import { CreationGuidance } from './creation-guidance';
import { renderDocumentNode } from './document-nodes';
import { DocumentOutline } from './document-outline';
import { buildDocumentOutline } from './document-outline-model';
import { PublishedReadingStatistics } from './published-reading-statistics';
import { wikiOf } from './wiki-model';

export function DocumentView({
  draft,
  showOutline = false,
  showReadingStatistics = false,
  outlineScope = 'lettin-document',
}: {
  draft: LettinDraft;
  showOutline?: boolean;
  showReadingStatistics?: boolean;
  outlineScope?: string;
}) {
  const t = useTranslations('lettin');
  const outline = showOutline
    ? buildDocumentOutline(draft.content, outlineScope)
    : undefined;
  return (
    <article
      className="lettin-prose wiki-theme"
      data-wiki-theme={draft.theme?.palette}
      data-wiki-type={draft.theme?.typography}
      data-wiki-motion={draft.theme?.motion}
    >
      <ContentNotice notice={draft.contentNotice} />
      {draft.image && (
        // biome-ignore lint/performance/noImgElement: Artwork must bypass optimizer caching so private media access can be revoked.
        <img
          src={draft.image}
          alt={draft.title}
          referrerPolicy="no-referrer"
          className="mb-8 max-h-96 w-full object-cover"
        />
      )}
      <h1 className="break-words text-4xl md:text-5xl">{draft.title}</h1>
      {draft.credit && (
        <p className="text-muted-foreground text-sm">{draft.credit}</p>
      )}
      {showReadingStatistics && (
        <PublishedReadingStatistics content={draft.content} />
      )}
      <CreationGuidance value={draft.creationGuidance} />
      <p className="text-lg text-muted-foreground">{draft.description}</p>
      <div className="flex flex-wrap gap-2">
        {(draft.tags ?? []).map((tag) => (
          <span
            className="border border-foreground bg-secondary px-3 py-1 font-bold text-xs uppercase tracking-wider"
            key={tag}
          >
            {tag}
          </span>
        ))}
      </div>
      {wikiOf(draft).aliases.length > 0 && (
        <p className="text-muted-foreground text-sm">
          {wikiOf(draft).aliases.join(' · ')}
        </p>
      )}
      {wikiOf(draft).facts.length > 0 && (
        <dl className="wiki-facts">
          {wikiOf(draft).facts.map((fact, index) => (
            <div key={`${index}-${fact.label}`}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {wikiOf(draft).chronology && (
        <p className="wiki-date">
          {wikiOf(draft).chronology?.era} · {wikiOf(draft).chronology?.label}
        </p>
      )}
      <ArtworkGallery items={draft.gallery} />
      {outline && (
        <DocumentOutline items={outline.items} truncated={outline.truncated} />
      )}
      {renderDocumentNode(
        draft.content,
        0,
        {
          completed: t('completedTask'),
          incomplete: t('incompleteTask'),
        },
        outline ? { ids: outline.ids, path: '0' } : undefined
      )}
    </article>
  );
}
