'use client';
import type { LettinPublicWorld } from '@tuturuuu/internal-api/lettin';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { DocumentView } from './document-view';
export function PublicWorld({
  world,
  initialEntry,
}: {
  world: LettinPublicWorld;
  initialEntry?: string;
}) {
  const t = useTranslations('lettin');
  const [selected, setSelected] = useState(initialEntry ?? '');
  const [search, setSearch] = useState('');
  const entry = world.entries.find((e) => e.id === selected);
  const draft = entry?.published ?? world.published;
  const links = entry
    ? world.entries.filter((e) => draft.links.includes(e.id))
    : [];
  const backlinks = entry
    ? world.entries.filter((e) => e.published.links.includes(entry.id))
    : [];
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-5 py-10 md:grid-cols-[220px_minmax(0,1fr)] md:px-10">
      <aside className="space-y-4">
        <Button
          className="h-auto w-full whitespace-normal break-words text-left"
          variant="secondary"
          onClick={() => setSelected('')}
        >
          {world.published.title}
        </Button>
        <label className="block space-y-2 text-sm">
          {t('searchEntries')}
          <Input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <nav
          className="max-h-72 space-y-1 overflow-y-auto md:max-h-[65vh]"
          aria-label={t('entries')}
        >
          {world.entries
            .filter((e) =>
              `${e.published.title} ${e.published.description} ${e.published.tags.join(' ')}`
                .toLowerCase()
                .includes(search.toLowerCase())
            )
            .map((e) => (
              <Button
                key={e.id}
                variant={e.id === selected ? 'secondary' : 'ghost'}
                className="h-auto w-full justify-start whitespace-normal break-words text-left"
                onClick={() => {
                  setSelected(e.id);
                  window.history.replaceState(null, '', `?entry=${e.id}`);
                }}
              >
                {e.published.title}
              </Button>
            ))}
        </nav>
      </aside>
      <div className="notebook-paper min-w-0 rounded-xl p-6 md:p-10">
        <Link
          href={`/creators/${world.creatorId}`}
          className="mb-6 inline-block text-sm underline"
        >
          {t('creatorWorlds')}
        </Link>
        <DocumentView draft={draft} />
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
                      onClick={() => setSelected(e.id)}
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
