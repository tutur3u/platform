'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  notificationListOptions,
  useNotificationSubscription,
  useUnreadCount,
} from '@tuturuuu/ui/hooks/use-notifications';
import { useAfterFirstPaint } from '@tuturuuu/ui/hooks/use-after-first-paint';
import { Popover, PopoverAnchor, PopoverContent } from '@tuturuuu/ui/popover';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  lazy,
  Suspense,
  useEffect,
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
import {
  focusAccountAnchor,
  useAccountHub,
  usePublishAccountHub,
} from './sidebar-footer-context';

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
  hostApp?: 'mail';
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
  // Inside the shared sidebar the avatar is the entry: its menu opens this
  // popover and its badge shows the unread count, so no bell is rendered.
  const hub = useAccountHub();
  const merged = hub !== null;
  const [localOpen, setLocalOpen] = useState(false);
  const open = merged ? hub.state.notificationsOpen : localOpen;
  const setOpen = (next: boolean) =>
    merged ? hub.patch({ notificationsOpen: next }) : setLocalOpen(next);
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
  const hubLabels = useMemo(
    () => ({ label: labels.notifications, unreadText: labels.unreadCount }),
    [labels.notifications, labels.unreadCount]
  );
  usePublishAccountHub('notifications', userId ? hubLabels : undefined);
  const publishUnread = hub?.patch;
  useEffect(() => {
    publishUnread?.({ unreadCount });
    return () => publishUnread?.({ unreadCount: 0 });
  }, [publishUnread, unreadCount]);

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

  // Runs whenever the popover opens, whether from its own bell or from the
  // avatar menu.
  const prepareOpen = () => {
    setPlacement(
      resolveNotificationPlacement(
        merged ? hub.anchorRef.current : triggerRef.current,
        window.innerWidth
      )
    );
    if (userId) {
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
  };
  const onOpenChange = (next: boolean) => {
    if (next && !merged) prepareOpen();
    setOpen(next);
  };
  useEffect(() => {
    if (merged && open) prepareOpen();
  }, [merged, open]);

  if (!userId) return null;

  const base = webAppUrl ?? '';
  const pageUrl = param
    ? `${base}/${param}/notifications`
    : `${base}/notifications`;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {merged ? (
        <PopoverAnchor virtualRef={hub.anchorRef} />
      ) : (
        <NotificationPopoverTriggerButton
          notificationsText={labels.notifications}
          unreadCount={unreadCount}
          unreadCountText={labels.unreadCount}
          onIntent={onIntent}
          triggerRef={triggerRef}
        />
      )}
      <PopoverContent
        ref={contentRef}
        onCloseAutoFocus={
          merged
            ? (event) => {
                event.preventDefault();
                focusAccountAnchor(hub.anchorRef.current);
              }
            : undefined
        }
        tabIndex={-1}
        side={side ?? placement.side}
        align={align ?? placement.align}
        aria-labelledby={titleId}
        collisionPadding={12}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        data-notification-frame
        style={{
          width: 'min(400px, calc(100vw - 24px))',
          height:
            'min(560px, calc(100dvh - 24px), var(--radix-popover-content-available-height, calc(100dvh - 24px)))',
        }}
        className="flex flex-col overflow-hidden p-0 shadow-lg [--popover-padding:0]"
      >
        <Suspense
          fallback={
            <div className="flex h-full flex-col" aria-busy>
              <Skeleton className="m-4 h-8 w-32 shrink-0" />
              <div className="min-h-0 flex-1 space-y-1 p-2">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="flex gap-2.5 px-2 py-2.5">
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-1.5 pt-1">
                      <Skeleton className="h-3 w-11/12" />
                      <Skeleton className="h-2.5 w-2/5" />
                    </div>
                  </div>
                ))}
              </div>
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
