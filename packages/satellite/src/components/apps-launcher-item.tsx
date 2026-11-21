import { Star } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type {
  ComponentPropsWithoutRef,
  ComponentType,
  ElementType,
  ReactNode,
} from 'react';
import type { AppOpenMode } from './apps-launcher-catalog';
import { getAppLauncherIcon } from './apps-launcher-icons';
import type { AppsLauncherHighlight } from './apps-launcher-search';
import type { AppsLauncherEntry } from './apps-launcher-view';

type OptionLinkProps = ComponentPropsWithoutRef<'a'> & {
  'aria-selected': boolean;
  'data-active'?: boolean;
  'data-app-slug': string;
  'data-slot': string;
};

export type AppLauncherOptionProps = {
  entry: AppsLauncherEntry;
  href: string;
  isActive: boolean;
  isCurrent: boolean;
  linkComponent?: ElementType;
  onActivate: () => void;
  onOpen: () => void;
  openMode: AppOpenMode;
  title: string;
};

function OptionLink({
  children,
  className,
  entry,
  href,
  isActive,
  linkComponent,
  onActivate,
  onOpen,
  openMode,
  slot,
  title,
}: AppLauncherOptionProps & {
  children: ReactNode;
  className: string;
  slot: string;
}) {
  const props: OptionLinkProps = {
    'aria-label': title,
    'aria-selected': isActive,
    className,
    'data-active': isActive || undefined,
    'data-app-slug': entry.app.slug,
    'data-slot': slot,
    href,
    id: entry.id,
    onClick: onOpen,
    onPointerMove: isActive ? undefined : onActivate,
    rel: openMode === 'new-tab' ? 'noopener noreferrer' : undefined,
    role: 'option',
    tabIndex: -1,
    target: openMode === 'new-tab' ? '_blank' : undefined,
  };

  const usesApexDocument =
    href.startsWith('https://tuturuuu.com/') &&
    ['platform', 'meet', 'mail', 'calendar'].includes(entry.app.slug);
  if (linkComponent && !usesApexDocument) {
    const LinkComponent = linkComponent as ComponentType<OptionLinkProps>;
    return <LinkComponent {...props}>{children}</LinkComponent>;
  }
  return <a {...props}>{children}</a>;
}

function AppIcon({
  entry,
  chip,
}: {
  chip?: boolean;
  entry: AppsLauncherEntry;
}) {
  const Icon = getAppLauncherIcon(entry.app);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center bg-muted text-foreground',
        chip ? 'size-7 rounded-full' : 'size-8 rounded-(--radius-inner)'
      )}
      data-slot="app-option-icon"
    >
      <Icon className={chip ? 'size-3.5' : 'size-4'} />
    </span>
  );
}

function HighlightedText({
  ranges,
  text,
}: {
  ranges: readonly AppsLauncherHighlight[];
  text: string;
}) {
  if (ranges.length === 0) return text;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    const safeStart = Math.max(cursor, Math.min(start, text.length));
    const safeEnd = Math.min(end, text.length);
    if (safeEnd <= safeStart) continue;
    if (safeStart > cursor) parts.push(text.slice(cursor, safeStart));
    parts.push(
      <mark
        className="rounded-sm bg-primary/15 text-inherit"
        data-slot="app-option-match"
        key={safeStart}
      >
        {text.slice(safeStart, safeEnd)}
      </mark>
    );
    cursor = safeEnd;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

export function AppLauncherChip(props: AppLauncherOptionProps) {
  return (
    <OptionLink
      {...props}
      className={cn(
        'inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 font-medium text-sm outline-none transition-colors motion-reduce:transition-none',
        props.isActive
          ? 'border-border bg-accent text-accent-foreground'
          : 'border-border/70 bg-muted/40 hover:bg-muted',
        props.isCurrent && !props.isActive && 'text-muted-foreground'
      )}
      slot="app-chip"
    >
      <AppIcon chip entry={props.entry} />
      <span className="truncate">{props.title}</span>
    </OptionLink>
  );
}

export function AppLauncherRow({
  categoryLabel,
  currentLabel,
  favoriteLabel,
  isFavorite,
  onToggleFavorite,
  ...props
}: AppLauncherOptionProps & {
  categoryLabel?: string;
  currentLabel: string;
  favoriteLabel: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <div className="group/app-row relative" data-slot="app-row" role="none">
      <OptionLink
        {...props}
        className={cn(
          'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-(--radius-inner) py-1.5 pr-11 pl-1.5 text-sm outline-none transition-colors motion-reduce:transition-none',
          props.isActive
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-muted/60'
        )}
        slot="app-option"
      >
        <AppIcon entry={props.entry} />
        <span
          className="min-w-0 flex-1 truncate font-medium"
          data-slot="app-option-title"
        >
          <HighlightedText ranges={props.entry.highlight} text={props.title} />
        </span>
        {props.isCurrent ? (
          <span
            className="shrink-0 rounded-full border px-2 py-px font-medium text-muted-foreground text-xs"
            data-slot="app-option-current"
          >
            {currentLabel}
          </span>
        ) : null}
        {categoryLabel ? (
          <span className="hidden shrink-0 text-muted-foreground text-xs sm:inline">
            {categoryLabel}
          </span>
        ) : null}
      </OptionLink>
      <button
        aria-label={favoriteLabel}
        aria-pressed={isFavorite}
        className={cn(
          'absolute top-1/2 right-1 flex size-8 -translate-y-1/2 cursor-pointer pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5 pointer-coarse:after:content-[""] items-center justify-center rounded-(--radius-inner) text-muted-foreground transition-opacity hover:bg-background/60 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
          isFavorite || props.isActive
            ? 'opacity-100'
            : 'opacity-0 group-hover/app-row:opacity-100',
          isFavorite && 'text-foreground'
        )}
        data-slot="app-favorite-toggle"
        onClick={onToggleFavorite}
        onMouseDown={(event) => event.preventDefault()}
        tabIndex={-1}
        type="button"
      >
        <Star
          aria-hidden
          className={cn('size-4', isFavorite && 'fill-current')}
        />
      </button>
    </div>
  );
}
