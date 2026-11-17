'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  notificationListOptions,
  useNotificationSubscription,
  useUnreadCount,
} from '@tuturuuu/ui/hooks/use-notifications';
import { useAfterFirstPaint } from '@tuturuuu/ui/hooks/use-after-first-paint';
import { Popover, PopoverContent } from '@tuturuuu/ui/popover';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  lazy,
  Suspense,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  actorLists,
  trimClosedList,
} from '@tuturuuu/ui/hooks/notification-cache';
import type { NotificationCodeText } from './notification-code-text';
import {
  DEFAULT_NOTIFICATION_LABELS,
  type NotificationLabels,
} from './notification-labels';
import {
  type NotificationAlign,
  type NotificationPlacement,
  type NotificationSide,
  resolveNotificationPlacement,
} from './notification-placement';
import { NotificationPopoverTriggerButton } from './notification-popover-trigger';
import { useNotificationRuntime } from './notification-runtime';

const NOTIFICATION_POLL_INTERVAL_MS = 2 * 60_000;
const PAGE_SIZE = 20;

// The panel (list, rows, grouping, invite actions) is its own chunk; a closed
// bell ships only the trigger and the unread count query.
const loadPanel = () => import('@tuturuuu/ui/custom/notification-panel');
const NotificationPanel = lazy(() =>
  loadPanel().then((module) => ({ default: module.NotificationPanel }))
);

export interface NotificationPopoverClientProps {
  userId?: string;
  /** Optional app-specific freshness policy for non-subscription consumers. */
  pollIntervalMs?: number;
  labels?: Partial<NotificationLabels>;
  /** Localized text for notifications rendered by code. */
  codeText?: NotificationCodeText;
  /** Base URL of the web app; "View all" links to {webAppUrl}/{wsId}/notifications. */
  webAppUrl?: string;
  /** Overrides the placement resolved from where the bell is mounted. */
  side?: NotificationSide;
  align?: NotificationAlign;
}

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
const SPECIAL_WORKSPACE_SLUGS = new Set(['personal', 'internal']);

export default function SatelliteNotificationPopover({
  userId,
  pollIntervalMs = NOTIFICATION_POLL_INTERVAL_MS,
  labels: labelOverrides,
  codeText,
  webAppUrl,
  side,
  align,
}: NotificationPopoverClientProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<NotificationPlacement>({
    side: 'bottom',
    align: 'end',
  });
  const { params, realtime, apiOptions } = useNotificationRuntime();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const labels = useStableLabels(labelOverrides);

  const param = typeof params.wsId === 'string' ? params.wsId : undefined;
  const routeWsId = param && UUID_REGEX.test(param) ? param : undefined;
  const taskWsId =
    param && (UUID_REGEX.test(param) || SPECIAL_WORKSPACE_SLUGS.has(param))
      ? param
      : undefined;
  const refetchInterval = realtime ? undefined : pollIntervalMs;

  const afterFirstPaint = useAfterFirstPaint();
  const { data: unreadCount = 0 } = useUnreadCount(routeWsId, {
    cacheScope: userId,
    enabled: Boolean(userId) && afterFirstPaint,
    refetchInterval,
    apiOptions,
  });
  useNotificationSubscription(routeWsId || '', realtime ? userId || '' : '');

  const onIntent = useCallback(() => {
    if (!userId) return;
    void loadPanel();
    void queryClient.prefetchInfiniteQuery(
      notificationListOptions({
        cacheScope: userId,
        wsId: routeWsId,
        unreadOnly: true,
        pageSize: PAGE_SIZE,
        apiOptions,
      })
    );
  }, [queryClient, userId, routeWsId, apiOptions]);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setPlacement(
        resolveNotificationPlacement(triggerRef.current, window.innerWidth)
      );
    }
    if (next && userId) {
      // Closed lists reopen on their first page instead of refetching every
      // page they had loaded.
      for (const { queryKey } of actorLists(queryClient, userId)) {
        const observers = queryClient
          .getQueryCache()
          .find({ queryKey, exact: true })
          ?.getObserversCount();
        if (!observers) trimClosedList(queryClient, queryKey);
      }
    }
    setOpen(next);
  };

  if (!userId) return null;

  const base = webAppUrl ?? '';
  const pageUrl = param
    ? `${base}/${param}/notifications`
    : `${base}/notifications`;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <NotificationPopoverTriggerButton
        notificationsText={labels.notifications}
        unreadCount={unreadCount}
        unreadCountText={labels.unreadCount}
        onIntent={onIntent}
        triggerRef={triggerRef}
      />
      <PopoverContent
        ref={contentRef}
        tabIndex={-1}
        side={side ?? placement.side}
        align={align ?? placement.align}
        aria-labelledby={titleId}
        collisionPadding={12}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        className="flex max-h-[min(600px,calc(var(--radix-popover-content-available-height)-12px))] w-100 max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0 shadow-lg [--popover-padding:0]"
      >
        <Suspense
          fallback={
            <div className="space-y-2 p-4" aria-busy>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-16 w-full" />
            </div>
          }
        >
          <NotificationPanel
            userId={userId}
            routeWsId={routeWsId}
            taskWsId={taskWsId}
            labels={labels}
            codeText={codeText}
            pageUrl={pageUrl}
            refetchInterval={refetchInterval}
            apiOptions={apiOptions}
            titleId={titleId}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}

/** Merged labels keep one identity per host label object so rows stay memoized. */
function useStableLabels(overrides?: Partial<NotificationLabels>) {
  return useMemo<NotificationLabels>(
    () => ({ ...DEFAULT_NOTIFICATION_LABELS, ...overrides }),
    [overrides]
  );
}
