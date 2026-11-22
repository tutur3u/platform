'use client';

import { MessageSquare } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
  useId,
} from 'react';

/**
 * Whether this person may Follow and Summon. Only then does a launch action
 * explain that it opens the activity for them and Summon brings others.
 */
export const ActivitiesNavigationContext = createContext(false);

/** One entry in the Activities dialog. */
export type ActivityTile = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Open for this person now; listed under Open now. */
  active: boolean;
  description?: string;
  /** Launches the activity; absent where it may only be previewed. */
  open?: () => void;
  /** Content shown inside the dialog instead of launching anything. */
  page?: (close: () => void) => ReactNode;
  /** Whether the overview grid lists it; its sidebar entry always shows. */
  listed?: boolean;
};

function OpenBadge() {
  const t = useTranslations('meet.call.activities');
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground text-xs">
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-foreground"
      />
      {t('open_state')}
    </span>
  );
}

function LaunchButton({
  tile,
  onLaunch,
}: {
  tile: ActivityTile;
  onLaunch: (tile: ActivityTile) => void;
}) {
  const t = useTranslations('meet.call.activities');
  const navigationAllowed = useContext(ActivitiesNavigationContext);
  if (!tile.open && !tile.page) return null;
  const opens = tile.active || !!tile.page;
  const button = (
    <Button
      type="button"
      size="sm"
      variant={opens ? 'outline' : 'default'}
      className="rounded-full"
      aria-label={t(opens ? 'open_named' : 'start_named', {
        name: tile.label,
      })}
      onClick={() => onLaunch(tile)}
    >
      {t(opens ? 'open' : 'start')}
    </Button>
  );
  // Starting an activity opens it for this person only; Summon brings
  // others to it.
  if (tile.page || !navigationAllowed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{t('hint')}</TooltipContent>
    </Tooltip>
  );
}

function ActivityIcon({ tile }: { tile: ActivityTile }) {
  const Icon = tile.icon;
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
      <Icon className="size-5" />
    </span>
  );
}

function ActivityCard({
  tile,
  onLaunch,
}: {
  tile: ActivityTile;
  onLaunch: (tile: ActivityTile) => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <ActivityIcon tile={tile} />
        <div className="grid min-w-0 flex-1 gap-1">
          <p className="font-medium text-sm">{tile.label}</p>
          {tile.description && (
            <p className="text-muted-foreground text-sm">{tile.description}</p>
          )}
        </div>
        {tile.active && <OpenBadge />}
      </div>
      <div className="mt-auto flex justify-end">
        <LaunchButton tile={tile} onLaunch={onLaunch} />
      </div>
    </li>
  );
}

function ActivitySection({
  title,
  tiles,
  onLaunch,
}: {
  title: string;
  tiles: readonly ActivityTile[];
  onLaunch: (tile: ActivityTile) => void;
}) {
  const id = useId();
  if (!tiles.length) return null;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h3 id={id} className="font-semibold text-base tracking-tight">
        {title}
      </h3>
      <ul className="grid gap-3 sm:grid-cols-2">
        {tiles.map((tile) => (
          <ActivityCard key={tile.id} tile={tile} onLaunch={onLaunch} />
        ))}
      </ul>
    </section>
  );
}

/** The overview: what is open now, then everything that can be started. */
export function AllActivitiesPage({
  tiles,
  onLaunch,
  onFeedback,
}: {
  tiles: readonly ActivityTile[];
  onLaunch: (tile: ActivityTile) => void;
  /** Set in a showcase preview, where attendees share feedback instead. */
  onFeedback?: () => void;
}) {
  const t = useTranslations('meet.call.activities');
  const roomT = useTranslations('meet.call.room_tools');
  return (
    <div className="space-y-8">
      {onFeedback && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
          <Badge variant="outline">{roomT('preview')}</Badge>
          <p className="min-w-0 flex-1 text-muted-foreground text-sm">
            {roomT('preview_hint')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={onFeedback}
          >
            <MessageSquare className="size-4" />
            {roomT('feedback')}
          </Button>
        </div>
      )}
      <ActivitySection
        title={t('open_now')}
        tiles={tiles.filter((tile) => tile.active)}
        onLaunch={onLaunch}
      />
      <ActivitySection
        title={t('start_section')}
        tiles={tiles.filter((tile) => !tile.active && tile.listed !== false)}
        onLaunch={onLaunch}
      />
    </div>
  );
}

/** One activity's page; the shell already shows its name and description. */
export function ActivityDetailPage({
  tile,
  onLaunch,
}: {
  tile: ActivityTile;
  onLaunch: (tile: ActivityTile) => void;
}) {
  const roomT = useTranslations('meet.call.room_tools');
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
      <ActivityIcon tile={tile} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {tile.active && <OpenBadge />}
        {!tile.open && !tile.page && (
          <Badge variant="outline">{roomT('preview')}</Badge>
        )}
      </div>
      <LaunchButton tile={tile} onLaunch={onLaunch} />
    </div>
  );
}
