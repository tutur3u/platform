'use client';

import { Maximize, Minimize, RefreshCw, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ComponentType, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useActivityPane } from './activity-pane-context';

/** The body states every activity shares; exactly one applies at a time. */
export type ActivityState =
  | { kind: 'ready' }
  | { kind: 'loading' }
  | { kind: 'empty'; title: string; description?: string; action?: ReactNode }
  | {
      kind: 'error';
      title?: string;
      description?: string;
      onRetry?: () => void;
    };

export function ActivityStatus({
  live,
  children,
}: {
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-0 shrink items-center gap-1.5 truncate rounded-full px-2 font-mono text-[10px] uppercase tracking-widest',
        live
          ? 'bg-dynamic-green/15 text-dynamic-green'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {live && (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-current motion-safe:animate-pulse"
        />
      )}
      {children}
    </span>
  );
}

/**
 * Puts an activity's status chip and actions in its pane's header. Outside a
 * pane, or while the activity is a hidden tab, it renders nothing.
 */
export function PaneHeaderExtras({
  status,
  live,
  actions,
}: {
  /** Plain text becomes a chip; richer content is shown as given. */
  status?: ReactNode;
  live?: boolean;
  actions?: ReactNode;
}) {
  const pane = useActivityPane();
  // Actions stay reachable on a pane too small to show its content.
  if (!pane?.headerSlot || !pane.visible || (!status && !actions)) return null;
  const chip =
    typeof status === 'string' ? (
      <ActivityStatus live={live}>{status}</ActivityStatus>
    ) : status ? (
      <span className="flex min-w-0 shrink items-center gap-2 overflow-hidden whitespace-nowrap text-muted-foreground text-xs">
        {status}
      </span>
    ) : null;
  return createPortal(
    <>
      {chip}
      {actions}
    </>,
    pane.headerSlot
  );
}

/** The loading, empty and error body of an activity. Ready renders nothing. */
export function ActivityStateView({ state }: { state: ActivityState }) {
  const t = useTranslations('meet.call.stage_layout');
  const pane = useActivityPane();
  switch (state.kind) {
    case 'loading':
      return (
        <div
          role="status"
          aria-busy="true"
          aria-label={t('loading', { title: pane?.title ?? '' })}
          className="flex flex-col gap-3 p-4"
        >
          <Skeleton className="h-20 w-full rounded-xl" />
          <div className="flex gap-2">
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8 flex-1" />
          </div>
        </div>
      );
    case 'empty':
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <p className="font-semibold text-sm">{state.title}</p>
          {state.description && (
            <p className="text-muted-foreground text-sm">{state.description}</p>
          )}
          {state.action}
        </div>
      );
    case 'error':
      return (
        <div
          role="alert"
          className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center"
        >
          <p className="font-semibold text-sm">
            {state.title ?? t('error', { title: pane?.title ?? '' })}
          </p>
          {state.description && (
            <p className="text-muted-foreground text-sm">{state.description}</p>
          )}
          {state.onRetry && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-full px-3.5"
              onClick={state.onRetry}
            >
              <RefreshCw className="size-4" />
              {t('retry')}
            </Button>
          )}
        </div>
      );
    default:
      return null;
  }
}

/**
 * The frame every activity shares. Inside a pane the pane's header carries
 * the icon, title, maximize and close, and this adds the status chip and
 * actions to it; the body shows the standard loading, empty and error states.
 * Outside a pane it draws its own header.
 */
export function ActivityShell({
  title,
  icon: Icon,
  status,
  live,
  actions,
  state = { kind: 'ready' },
  className,
  children,
}: {
  title: string;
  icon?: ComponentType<{ className?: string }>;
  status?: ReactNode;
  live?: boolean;
  actions?: ReactNode;
  state?: ActivityState;
  className?: string;
  children?: ReactNode;
}) {
  const pane = useActivityPane();
  return (
    <section
      aria-label={title}
      className={cn('flex h-full min-h-0 w-full flex-col', className)}
    >
      {pane ? (
        <PaneHeaderExtras status={status} live={live} actions={actions} />
      ) : (
        <header className="flex items-center gap-2 border-b px-3 py-2">
          {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
          <h2 className="min-w-0 flex-1 truncate font-semibold text-sm">
            {title}
          </h2>
          {status ? (
            <ActivityStatus live={live}>{status}</ActivityStatus>
          ) : null}
          {actions}
        </header>
      )}
      {state.kind === 'ready' ? (
        <div className="@container min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      ) : (
        <ActivityStateView state={state} />
      )}
    </section>
  );
}

/** Maximize and close, shared by the pane header and the phone header. */
export function PaneWindowActions({
  title,
  maximized,
  onToggleMaximize,
  onClose,
  canMaximize = true,
}: {
  title: string;
  maximized: boolean;
  onToggleMaximize: () => void;
  onClose: () => void;
  canMaximize?: boolean;
}) {
  const t = useTranslations('meet.call.stage_layout');
  // Corner brackets: the pane fills the stage. Activities with their own full
  // screen use the diagonal arrows, so the two are told apart.
  const MaximizeIcon = maximized ? Minimize : Maximize;
  const maximizeLabel = t(maximized ? 'restore' : 'maximize', { title });
  return (
    <>
      {canMaximize && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 rounded-full pointer-coarse:size-11"
          aria-label={maximizeLabel}
          aria-pressed={maximized}
          title={maximizeLabel}
          onClick={onToggleMaximize}
        >
          <MaximizeIcon aria-hidden="true" className="size-4" />
        </Button>
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8 shrink-0 rounded-full pointer-coarse:size-11"
        aria-label={t('close', { title })}
        title={t('close', { title })}
        onClick={onClose}
      >
        <X aria-hidden="true" className="size-4" />
      </Button>
    </>
  );
}
