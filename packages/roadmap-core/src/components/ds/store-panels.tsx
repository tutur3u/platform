import { ExternalLink, Sparkles } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import type { Locale } from '../../content/store-releases';
import { fill } from '../insights/format';
import type { Lang, Messages } from '../shared';
import type { Store } from './store-data';
import { StoreGallery } from './store-gallery';
import { Chips, PanelBox } from './store-listing';
import { STATUS_BADGE } from './store-row';
import { StoreTimeline, storeDate } from './store-steps';

type Props = { store: Store; lang: Lang; t: Messages['storeReleases'] };

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function deviceName(t: Messages['storeReleases'], id: string) {
  return (t.deviceNames as Record<string, string>)[id] ?? id;
}

/** The store category in the page's language, as listed when unknown. */
function categoryName(t: Messages['storeReleases'], category: string) {
  return (t.categories as Record<string, string>)[category] ?? category;
}

/** Status, the five release dates and the store's versions and builds. */
export function OverviewPanel({ store, lang, t }: Props) {
  const { release } = store;
  const statuses = t.statuses as Record<string, string>;
  const status = (
    <Badge variant={STATUS_BADGE[release.status] ?? 'secondary'}>
      {statuses[release.status] ?? t.pending}
    </Badge>
  );
  const target = release.targetLiveDate
    ? storeDate(lang).format(new Date(release.targetLiveDate))
    : t.pending;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <PanelBox title={t.timeline} className="lg:row-span-2">
        <StoreTimeline store={store} lang={lang} t={t} />
      </PanelBox>
      <PanelBox title={t.status}>
        <Facts
          rows={[
            [t.status, status],
            [t.version, `${release.version} (${t.build} ${release.build})`],
            [t.platform, store.platform],
            [t.category, categoryName(t, store.category)],
          ]}
        />
      </PanelBox>
      <PanelBox title={t.history}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-muted-foreground text-xs">
                <th className="pe-3 pb-2 font-medium">{t.version}</th>
                <th className="pe-3 pb-2 font-medium">{t.build}</th>
                <th className="pe-3 pb-2 font-medium">{t.status}</th>
                <th className="pb-2 font-medium">{t.dates.targetLiveDate}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="py-2 pe-3">
                  {release.version}{' '}
                  <span className="text-muted-foreground text-xs">
                    {t.current}
                  </span>
                </td>
                <td className="py-2 pe-3">{release.build}</td>
                <td className="py-2 pe-3">
                  {statuses[release.status] ?? t.pending}
                </td>
                <td className="py-2">{target}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </PanelBox>
    </div>
  );
}

/** The listing screenshots as a grid, with the sizes prepared per device. */
export function ScreenshotsPanel({ store, lang, t }: Props) {
  const device = deviceName(t, store.device);
  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        {fill(t.captured, {
          device,
          language: t.locales[store.locale as Locale],
          count: store.shots.length,
        })}
      </p>
      <StoreGallery store={store} lang={lang} t={t} layout="grid" />
      <PanelBox title={t.prepared}>
        <Chips
          items={store.devices.map((entry) =>
            [deviceName(t, entry.id), entry.size].filter(Boolean).join(' · ')
          )}
        />
      </PanelBox>
    </div>
  );
}

/** This version's release notes, or when they will arrive. */
export function WhatsNewPanel({ store, lang, t }: Props) {
  if (store.whatsNew)
    return (
      <PanelBox title={`${t.version} ${store.release.version}`}>
        <div className="max-w-prose whitespace-pre-line text-sm leading-relaxed">
          {store.whatsNew[lang]}
        </div>
      </PanelBox>
    );
  return (
    <div className="grid place-items-center gap-2 rounded-xl border border-dashed bg-card px-4 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted text-dynamic-purple">
        <Sparkles size={20} aria-hidden />
      </span>
      <p className="font-semibold">{t.noNotes}</p>
      <p className="max-w-md text-muted-foreground text-sm">
        {fill(t.noNotesBody, { version: store.release.version })}
      </p>
    </div>
  );
}

const LINKS = ['marketing', 'privacy', 'support', 'accountDeletion'] as const;

/** Where and in which languages it ships, its screenshot sizes and links. */
export function AvailabilityPanel({ store, t }: Props) {
  const links = [
    ...(store.storeUrl
      ? [{ id: 'storePage' as const, href: store.storeUrl }]
      : []),
    ...LINKS.map((id) => ({ id, href: store.links[id] })),
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <PanelBox title={t.tabs.availability}>
        <Facts
          rows={[
            [t.store, store.name],
            [t.platform, store.platform],
            [t.category, categoryName(t, store.category)],
            [
              t.languages,
              store.languages.map((code) => t.locales[code]).join(', '),
            ],
          ]}
        />
        {!store.storeUrl && (
          <p className="text-muted-foreground text-sm">{t.notListed}</p>
        )}
      </PanelBox>
      <PanelBox title={t.deviceClasses}>
        <Chips items={store.devices.map((entry) => deviceName(t, entry.id))} />
      </PanelBox>
      <PanelBox title={t.links} className="md:col-span-2">
        <ul className="grid gap-2 sm:grid-cols-2">
          {links.map((link) => (
            <li key={link.id}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 rounded-sm text-sm underline-offset-4 outline-ring/50 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {t.linkNames[link.id]}
                <ExternalLink size={14} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </PanelBox>
    </div>
  );
}
