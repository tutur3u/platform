'use client';
import type { LettinPublicWorld } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { PublicLinkButton } from '@tuturuuu/ui/public-link-button';
import { getPublicContentLink } from '@tuturuuu/utils/public-content-link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { DocumentView } from './document-view';
import { ReadingSequence } from './reading-sequence';
import { WikiBrowser } from './wiki-browser';
import {
  filterWiki,
  type WikiSection,
  wikiOf,
  wikiSections,
} from './wiki-model';
export function PublicWorld({
  world,
  initialEntry,
}: {
  world: LettinPublicWorld;
  initialEntry?: string;
}) {
  const t = useTranslations('lettin');
  const [selected, setSelected] = useState(initialEntry ?? '');
  const select = (id: string) => {
    setSelected(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('entry', id);
    else url.searchParams.delete('entry');
    window.history.replaceState(null, '', url);
  };
  const [search, setSearch] = useState('');
  const [section, setSection] = useState<WikiSection>('overview');
  const records = world.entries.map((entry) => ({
    ...entry,
    draft: entry.published,
    version: 1,
    published_at: 'published',
  }));
  const visible = filterWiki(records, section, search);
  const entry = world.entries.find((e) => e.id === selected);
  const relationships = wikiOf(
    entry?.published ?? world.published
  ).relationships;
  const browse = !entry && section !== 'overview';
  const draft = entry?.published ?? world.published;
  const links = entry
    ? world.entries.filter((e) => draft.links.includes(e.id))
    : [];
  const backlinks = entry
    ? world.entries.filter((e) => e.published.links.includes(entry.id))
    : [];
  return (
    <main
      data-wiki-theme={world.published.theme?.palette}
      data-wiki-type={world.published.theme?.typography}
      data-wiki-motion={world.published.theme?.motion}
      className="wiki-theme mx-auto grid max-w-[90rem] gap-10 px-5 py-10 md:grid-cols-[240px_minmax(0,1fr)] md:px-10"
    >
      <aside className="lettin-sidebar space-y-4 md:sticky md:top-6 md:self-start">
        <Button
          className="h-auto w-full whitespace-normal break-words text-left"
          variant="secondary"
          onClick={() => select('')}
        >
          {world.published.title}
        </Button>
        <label className="block space-y-2 text-sm">
          {t('searchEntries')}
          <Input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="block space-y-2 text-sm">
          {t('kind')}
          <select
            className="w-full rounded border border-input bg-card p-2"
            value={section}
            onChange={(e) => {
              setSection(e.target.value as WikiSection);
              select('');
            }}
          >
            {wikiSections.map((value) => (
              <option key={value} value={value}>
                {t(`section${value}`)}
              </option>
            ))}
          </select>
        </label>
        {section !== 'relationships' && (
          <p role="status" className="text-muted-foreground text-sm">
            {t('readingEntryCount', { count: visible.length })}
          </p>
        )}
        {section !== 'relationships' && !visible.length && (
          <p className="text-muted-foreground text-sm">
            {t('noReadingMatches')}
          </p>
        )}
        {(search || section !== 'overview') && (
          <Button
            variant="outline"
            onClick={() => {
              setSearch('');
              setSection('overview');
              select('');
            }}
          >
            {t('clearReadingFilters')}
          </Button>
        )}
        <nav
          className="max-h-72 space-y-1 overflow-y-auto md:max-h-[65vh]"
          aria-label={t('entries')}
        >
          {visible.map((e) => (
            <Button
              key={e.id}
              variant={e.id === selected ? 'secondary' : 'ghost'}
              className="h-auto w-full justify-start whitespace-normal break-words text-left"
              onClick={() => select(e.id)}
            >
              {e.draft.title}
            </Button>
          ))}
        </nav>
      </aside>
      <div className="notebook-paper min-w-0 p-6 md:p-10">
        <Link
          href={`/creators/${world.creatorId}`}
          className="mb-6 inline-block text-sm underline"
        >
          {t('creatorWorlds')}
        </Link>
        <div className="mb-6">
          <PublicLinkButton
            url={getPublicContentLink({
              type: 'notebook',
              worldId: world.id,
              entryId: entry?.id,
            })}
            label={t(entry ? 'copyPublicEntryLink' : 'copyPublicNotebookLink')}
            copiedLabel={t('publicLinkCopied')}
            errorLabel={t('publicLinkCopyFailed')}
            manualCopyLabel={t('publicLinkManualCopy')}
          />
        </div>
        {browse ? (
          <>
            {!['timeline', 'relationships'].includes(section) && (
              <h1 className="mb-6 text-3xl">{t(`section${section}`)}</h1>
            )}
            <WikiBrowser
              entries={section === 'relationships' ? records : visible}
              search={search}
              section={section}
              disabled={false}
              onSelect={select}
            />
          </>
        ) : (
          <DocumentView
            draft={draft}
            showOutline
            outlineScope={`lettin-${world.id}-${entry?.id ?? 'notebook'}`}
          />
        )}
        {entry && (
          <ReadingSequence
            entries={visible.map(({ id, draft }) => ({
              id,
              title: draft.title,
            }))}
            selected={entry.id}
            onSelect={select}
          />
        )}
        {relationships.length > 0 && !browse && (
          <section className="wiki-reading-links mt-8">
            <h2>{t('relationships')}</h2>
            {relationships.map((relation) => {
              const target = world.entries.find(
                (item) => item.id === relation.targetId
              );
              return target ? (
                <Button
                  key={`${relation.targetId}-${relation.kind}`}
                  variant="outline"
                  onClick={() => select(target.id)}
                >
                  {relation.label || t(`relationship${relation.kind}`)} ·{' '}
                  {target.published.title}
                </Button>
              ) : null;
            })}
          </section>
        )}
        {(
          [
            ['linkedEntries', links],
            ['backlinks', backlinks],
          ] as const
        ).map(
          ([label, entries]) =>
            entries.length > 0 && (
              <section className="mt-8 border-border border-t pt-5" key={label}>
                <h2 className="mb-3 text-xl">{t(label)}</h2>
                <div className="flex flex-wrap gap-2">
                  {entries.map((e) => (
                    <Button
                      key={e.id}
                      variant="outline"
                      onClick={() => select(e.id)}
                    >
                      {e.published.title}
                    </Button>
                  ))}
                </div>
              </section>
            )
        )}
      </div>
    </main>
  );
}
