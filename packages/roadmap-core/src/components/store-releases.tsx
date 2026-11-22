import { CalendarClock } from '@tuturuuu/icons';
import { lazy, Suspense, useEffect, useState } from 'react';
import { nextRelease, type StoreSelection } from '../content/store-releases';
import { STORE_IDS, STORES } from './ds/store-data';
import { StoreRow } from './ds/store-row';
import { useStoreDialog } from './ds/use-store-dialog';
import { fill } from './insights/format';
import type { Lang, Messages } from './shared';

// The dialog and its tabs load on the first open (or a link that opens one).
const StoreDialog = lazy(() => import('./ds/store-dialog'));

type Props = { lang: Lang; t: Messages['storeReleases']; now: number };

/**
 * The heading, the next scheduled release and one compact row per store,
 * without the router: what the server renders and tests read.
 */
export function StoreReleaseList({
  lang,
  t,
  now,
  onOpen = () => {},
}: Props & { onOpen?: (id: string) => void }) {
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
      <ul
        aria-label={fill(t.summary, { count: STORES.length })}
        className="grid gap-3 lg:grid-cols-2"
      >
        {STORES.map((store) => (
          <li
            key={store.id}
            // A link to one store (#store-ios) keeps landing on its row.
            id={`store-${store.id}`}
            className="min-w-0 scroll-mt-24"
          >
            <StoreRow store={store} lang={lang} t={t} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Release status for each store as compact rows; a row opens the store in a
 * near-full-screen dialog whose store and tab live in the URL
 * (`?store=ios&tab=screenshots`).
 */
export function StoreReleases(props: Props) {
  const { selection, open, setTab, close } = useStoreDialog(STORE_IDS);
  // The dialog is client-only: the server and the first client render agree.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  // The last store stays mounted while the dialog animates closed.
  const [kept, setKept] = useState<StoreSelection | null>(selection);
  if (
    selection &&
    (selection.store !== kept?.store || selection.tab !== kept?.tab)
  )
    setKept(selection);
  const store = kept && STORES.find((entry) => entry.id === kept.store);

  return (
    <>
      <StoreReleaseList {...props} onOpen={open} />
      {hydrated && store && kept && (
        <Suspense fallback={null}>
          <StoreDialog
            store={store}
            tab={selection?.tab ?? kept.tab}
            open={Boolean(selection)}
            lang={props.lang}
            t={props.t}
            onTab={(tab) => setTab(store.id, tab)}
            onClose={close}
          />
        </Suspense>
      )}
    </>
  );
}
