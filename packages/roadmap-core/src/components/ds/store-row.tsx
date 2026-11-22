import {
  ChevronRight,
  Laptop,
  Monitor,
  Play,
  Smartphone,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import type { Lang, Messages } from '../shared';
import type { Store } from './store-data';
import { Thumb } from './store-gallery';
import { StoreProgress } from './store-steps';

export const STORE_ICON = {
  ios: Smartphone,
  macos: Laptop,
  android: Play,
  windows: Monitor,
} as const;

export const STATUS_BADGE: Record<
  string,
  'success' | 'warning' | 'error' | 'secondary' | 'outline'
> = {
  live: 'success',
  approved: 'success',
  submitted: 'warning',
  in_review: 'warning',
  rejected: 'error',
  preparing: 'secondary',
  planned: 'outline',
};

/** The store's glyph on a soft tile. */
export function StoreGlyph({
  store,
  size = 'md',
}: {
  store: Store;
  size?: 'md' | 'lg';
}) {
  const Icon = STORE_ICON[store.id];
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-xl bg-muted text-foreground ${
        size === 'lg' ? 'size-12' : 'size-11'
      }`}
    >
      <Icon size={size === 'lg' ? 24 : 20} />
    </span>
  );
}

/**
 * One store as a compact row: glyph, name, status, version and build, the
 * three release steps and two screenshots. The whole row is one button that
 * opens the store dialog.
 */
export function StoreRow({
  store,
  lang,
  t,
  onOpen,
}: {
  store: Store;
  lang: Lang;
  t: Messages['storeReleases'];
  onOpen: (id: string) => void;
}) {
  const { release } = store;
  const statuses = t.statuses as Record<string, string>;
  const wide = (store.shots[0]?.width ?? 0) > (store.shots[0]?.height ?? 1);
  return (
    <button
      type="button"
      data-store-row={store.id}
      aria-haspopup="dialog"
      onClick={() => onOpen(store.id)}
      className="group grid w-full min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 rounded-2xl border bg-card p-3.5 text-left outline-ring/50 transition-[border-color,box-shadow,transform] hover:border-foreground/20 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:hover:-translate-y-px sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]"
    >
      <StoreGlyph store={store} />
      <span className="grid min-w-0 gap-2">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-semibold text-base">{store.name}</span>
          <Badge variant={STATUS_BADGE[release.status] ?? 'secondary'}>
            {statuses[release.status] ?? t.pending}
          </Badge>
          <span className="text-muted-foreground text-sm tabular-nums">
            {store.platform} · {release.version} ({t.build} {release.build})
          </span>
        </span>
        <StoreProgress store={store} lang={lang} t={t} />
      </span>
      <span className="col-span-full flex items-center gap-1.5 sm:col-span-1">
        {store.shots.slice(0, 2).map((shot) => (
          <Thumb
            key={shot.id}
            shot={shot}
            lang={lang}
            decorative
            className={wide ? 'h-14 sm:h-12' : 'h-20 sm:h-16'}
          />
        ))}
        <ChevronRight
          size={18}
          aria-hidden
          className="ms-auto text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none sm:ms-1"
        />
      </span>
    </button>
  );
}
