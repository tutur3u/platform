import { CalendarClock } from '@tuturuuu/icons';
import { nextRelease } from '../content/store-releases';
import { StoreCard } from './ds/store-card';
import { STORES } from './ds/store-data';
import { fill } from './insights/format';
import type { Lang, Messages } from './shared';

/**
 * Release status and listing screenshots for each store, under one line
 * naming the next scheduled release.
 */
export function StoreReleases({
  lang,
  t,
  now,
}: {
  lang: Lang;
  t: Messages['storeReleases'];
  now: number;
}) {
  const next = nextRelease(STORES, now);
  const date = new Intl.DateTimeFormat(lang, {
    dateStyle: 'long',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  return (
    <section
      className="grid gap-4"
      id="store-releases"
      aria-labelledby="store-releases-title"
    >
      <header className="grid gap-1.5">
        <h2
          id="store-releases-title"
          className="font-semibold text-xl tracking-tight"
        >
          {t.heading}
        </h2>
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <CalendarClock size={16} aria-hidden />
          {next
            ? fill(t.nextBody, {
                store: next.store.name,
                date: date.format(new Date(next.at)),
              })
            : t.noNext}
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {STORES.map((store) => (
          <StoreCard key={store.id} store={store} lang={lang} t={t} />
        ))}
      </div>
    </section>
  );
}
