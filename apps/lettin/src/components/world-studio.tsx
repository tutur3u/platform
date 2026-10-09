'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight } from '@tuturuuu/icons';
import { getLettinWorld } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { getLettinTaskPlanUrl } from '@tuturuuu/utils/lettin-task-reference';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { Collaborators } from './collaborators';
import { CreatorCalendarPlan } from './creator-calendar-plan';
import { DuplicateEntry } from './duplicate-entry';
import { EntryEditor } from './entry-editor';
import { useNavigationGuard } from './navigation-guard';
import { QuickNote } from './quick-note';
import { initialWikiFilters } from './wiki-browse-model';
import { WikiBrowsingPanel } from './wiki-browsing-panel';
import { WikiCreateEntry } from './wiki-create-entry';
import { sectionKind, type WikiSection, wikiOf } from './wiki-model';
import { WikiSidebar } from './wiki-sidebar';
export function WorldStudio({
  wsId,
  worldId,
  section = 'overview',
  initialEntry,
}: {
  wsId: string;
  worldId: string;
  section?: WikiSection;
  initialEntry?: string;
}) {
  const t = useTranslations('lettin');
  const locale = useLocale();
  const [selected, setSelected] = useState<string | null>(initialEntry ?? null);
  const [filters, setFilters] = useState(initialWikiFilters);
  const { dirty, setDirty } = useNavigationGuard();
  useEffect(() => () => setDirty(false), [setDirty]);
  const query = useQuery({
    queryKey: ['lettin', wsId, worldId],
    queryFn: () => getLettinWorld(wsId, worldId),
  });
  const select = (id: string | null) => {
    if (dirty) return;
    setSelected(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('entry', id);
    else url.searchParams.delete('entry');
    window.history.replaceState(null, '', url);
  };
  if (query.isPending)
    return (
      <p role="status" className="p-10">
        {t('loading')}
      </p>
    );
  if (query.isError && !query.data)
    return (
      <div role="alert" className="p-10">
        {t('requestFailed')}{' '}
        <Button onClick={() => query.refetch()}>{t('retry')}</Button>
      </div>
    );
  const data = query.data;
  if (!data) return null;
  const record =
    selected === worldId
      ? data.world
      : data.entries.find((entry) => entry.id === selected);
  const taskPlanUrl = getLettinTaskPlanUrl({
    workspaceId: wsId,
    worldId,
    locale,
    entryId: record && record.id !== worldId ? record.id : undefined,
  });
  const related = record ? wikiOf(record.draft).relationships : [];
  const backlinks = record
    ? data.entries.filter(
        (entry) =>
          entry.draft.links.includes(record.id) ||
          wikiOf(entry.draft).relationships.some(
            (relation) => relation.targetId === record.id
          )
      )
    : [];
  return (
    <main
      className="wiki-studio wiki-theme"
      data-wiki-theme={data.world.draft.theme?.palette}
      data-wiki-type={data.world.draft.theme?.typography}
      data-wiki-motion={data.world.draft.theme?.motion}
    >
      {query.isError && (
        <p role="alert">
          {t('requestFailed')}{' '}
          <Button onClick={() => query.refetch()}>{t('retry')}</Button>
        </p>
      )}
      <header className="wiki-world-header">
        <Link href={`/${wsId}/wiki`} className="wiki-back">
          <ArrowLeft size={16} />
          {t('wikiLibrary')}
        </Link>
        <div>
          <p className="lettin-kicker">{t('worldWiki')}</p>
          <h1>{data.world.draft.title}</h1>
          <p>{data.world.draft.description || t('worldWikiHint')}</p>
        </div>
        {taskPlanUrl && (
          <a
            href={taskPlanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="wiki-public-link"
          >
            {t('planTask')} <ArrowUpRight size={16} />
          </a>
        )}
        {data.world.published_at && (
          <Link
            href={`/worlds/${worldId}`}
            target="_blank"
            className="wiki-public-link"
          >
            {t('viewPublic')}
            <ArrowUpRight size={16} />
          </Link>
        )}
      </header>
      <div className="wiki-workspace-grid">
        <aside className="wiki-side-panel">
          <WikiSidebar
            wsId={wsId}
            worldId={worldId}
            entries={data.entries}
            section={section}
            disabled={dirty}
            onOverview={() => select(worldId)}
          />
          <QuickNote
            key={`${wsId}:${worldId}`}
            wsId={wsId}
            worldId={worldId}
            disabled={dirty}
            onCreated={select}
          />
          <CreatorCalendarPlan
            key={`${wsId}:${worldId}`}
            wsId={wsId}
            disabled={dirty}
          />
          <WikiCreateEntry
            key={section}
            wsId={wsId}
            worldId={worldId}
            defaultKind={sectionKind[section]}
            disabled={dirty}
            onCreated={(id) => select(id)}
          />
        </aside>
        <div className="wiki-main-panel">
          {record ? (
            <>
              <Button
                variant="ghost"
                disabled={dirty}
                onClick={() => select(null)}
              >
                <ArrowLeft size={16} />
                {t(`section${section}`)}
              </Button>
              {record.id !== worldId && (
                <DuplicateEntry
                  key={record.id}
                  wsId={wsId}
                  worldId={worldId}
                  record={record}
                  disabled={dirty}
                  onCreated={select}
                />
              )}
              <EntryEditor
                key={record.id}
                record={record}
                wsId={wsId}
                worldId={worldId}
                worldRole={data.role}
                isWorld={record.id === worldId}
                entries={data.entries}
                onDirty={setDirty}
              />
              {(related.length > 0 || backlinks.length > 0) && (
                <section className="wiki-reading-links">
                  <h2>{t('connections')}</h2>
                  {related.map((relation) => {
                    const target = data.entries.find(
                      (entry) => entry.id === relation.targetId
                    );
                    return target ? (
                      <Button
                        key={`${relation.targetId}-${relation.kind}`}
                        variant="outline"
                        disabled={dirty}
                        onClick={() => select(target.id)}
                      >
                        {relation.label || t(`relationship${relation.kind}`)} ·{' '}
                        {target.draft.title}
                      </Button>
                    ) : null;
                  })}
                  {backlinks.map((entry) => (
                    <Button
                      key={entry.id}
                      variant="ghost"
                      disabled={dirty}
                      onClick={() => select(entry.id)}
                    >
                      {t('backlinks')} · {entry.draft.title}
                    </Button>
                  ))}
                </section>
              )}
            </>
          ) : (
            <WikiBrowsingPanel
              entries={data.entries}
              worldId={worldId}
              section={section}
              disabled={dirty}
              filters={filters}
              onChange={setFilters}
              onSelect={select}
            />
          )}
          {data.role === 'owner' && (
            <Collaborators
              key={`${wsId}:${data.world.id}`}
              wsId={wsId}
              data={data}
            />
          )}
        </div>
      </div>
    </main>
  );
}
