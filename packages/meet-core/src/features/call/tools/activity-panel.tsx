'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ComponentType, ReactNode } from 'react';
import { ResizableCallPanel } from '../components/resizable-call-panel';
import {
  type ActivityState,
  ActivityStateView,
} from '../stage-layout/activity-shell';
import { CallPanelHeader } from './tool-ui';

export type { ActivityState };

/**
 * The scrolling body every activity shares: 16px padding, 12px between
 * blocks, and a container for container-query layouts. A state other than
 * ready shows the standard loading, empty or error body instead.
 */
export function ActivityBody({
  title,
  state = { kind: 'ready' },
  busy,
  fixed = false,
  children,
}: {
  /** The activity's name, for the loading label. */
  title?: string;
  state?: ActivityState;
  busy?: boolean;
  /**
   * The body does not scroll: its children share the height, and one of them
   * scrolls. For a list with a footer that stays in view.
   */
  fixed?: boolean;
  children?: ReactNode;
}) {
  if (state.kind !== 'ready')
    return <ActivityStateView state={state} title={title} />;
  return (
    <div
      aria-busy={busy || undefined}
      className={cn(
        '@container flex min-h-0 flex-1 flex-col gap-3 p-4',
        fixed ? 'overflow-hidden' : 'overflow-y-auto'
      )}
    >
      {children}
    </div>
  );
}

/**
 * An activity's panel: header (icon, title, status, actions, close) and the
 * shared body. In a stage pane the pane carries the frame and header, so only
 * the status, the actions and the body remain.
 */
export function ActivityPanel({
  title,
  icon,
  status,
  actions,
  closeLabel,
  onClose,
  state,
  busy,
  fixedBody,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  /** A short status beside the title: text becomes a chip. */
  status?: ReactNode;
  actions?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  state?: ActivityState;
  busy?: boolean;
  /** See `ActivityBody`'s `fixed`. */
  fixedBody?: boolean;
  children?: ReactNode;
}) {
  return (
    <ResizableCallPanel label={title}>
      <CallPanelHeader
        icon={icon}
        title={title}
        subtitle={status}
        actions={actions}
        closeLabel={closeLabel}
        onClose={onClose}
      />
      <ActivityBody title={title} state={state} busy={busy} fixed={fixedBody}>
        {children}
      </ActivityBody>
    </ResizableCallPanel>
  );
}
