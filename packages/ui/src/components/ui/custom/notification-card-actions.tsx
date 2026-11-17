'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, Loader2, XCircle } from '@tuturuuu/icons';
import { updateNotificationMetadata } from '@tuturuuu/internal-api';
import {
  acceptWorkspaceInvite,
  declineWorkspaceInvite,
} from '@tuturuuu/internal-api/workspaces';
import { Button } from '@tuturuuu/ui/button';
import type { Notification } from '@tuturuuu/ui/hooks/use-notifications';
import {
  dispatchRequestOpenTask,
  waitForTaskOpenResult,
} from '@tuturuuu/ui/lib/task-open-events';
import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useState } from 'react';
import type { NotificationLabels } from './notification-labels';
import { useNotificationRuntime } from './notification-runtime';
import { invalidateWorkspaceInvitationCaches } from './workspace-invitation-cache';

export function getWorkspaceInviteWorkspaceId(notification: Notification) {
  return (
    [
      notification.data?.workspace_id,
      notification.entity_id,
      notification.ws_id,
    ].find(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.length > 0
    ) ?? null
  );
}

/** Where a notification leads, if anywhere. */
export function useNotificationOpen(routeWsId?: string) {
  const { router, params, pathname } = useNotificationRuntime();
  const [opening, setOpening] = useState<string | null>(null);

  const target = useCallback(
    (n: Notification) => {
      const wsId = n.ws_id || routeWsId;
      if (n.entity_type === 'task' && n.entity_id)
        return { kind: 'task' as const, taskId: n.entity_id, wsId };
      if (n.entity_type === 'time_tracking_request' && n.entity_id && wsId)
        return {
          kind: 'link' as const,
          href: `/${wsId}/time-tracker/requests`,
        };
      return null;
    },
    [routeWsId]
  );

  const open = useCallback(
    async (n: Notification) => {
      const to = target(n);
      if (!to) return false;
      if (to.kind === 'link') {
        router.push(to.href);
        return true;
      }
      setOpening(n.id);
      try {
        const { handled, requestId } = dispatchRequestOpenTask({
          taskId: to.taskId,
          wsId: to.wsId,
        });
        const opened = handled
          ? await waitForTaskOpenResult(requestId, 6000)
          : false;
        if (!opened && to.wsId) {
          const locale =
            typeof params?.locale === 'string' ? params.locale : '';
          const base = locale ? `/${locale}/${to.wsId}` : `/${to.wsId}`;
          const inWorkspace =
            pathname === base || pathname.startsWith(`${base}/`);
          const query = `openTaskId=${encodeURIComponent(to.taskId)}`;
          router.push(`${inWorkspace ? pathname : base}?${query}`);
        }
        return true;
      } finally {
        setOpening(null);
      }
    },
    [target, router, params, pathname]
  );

  return { target, open, opening };
}

export function NotificationInviteActions({
  notification,
  labels,
  onResolved,
}: {
  notification: Notification;
  labels: NotificationLabels;
  onResolved: () => void;
}) {
  const queryClient = useQueryClient();
  const { router } = useNotificationRuntime();
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null);
  const taken = notification.data?.action_taken;

  if (taken) {
    const accepted = taken === 'accepted';
    const Icon = accepted ? CheckCircle2 : XCircle;
    return (
      <span className="mt-1.5 inline-flex items-center gap-1 text-muted-foreground text-xs">
        <Icon
          aria-hidden
          className={accepted ? 'size-3.5 text-dynamic-green' : 'size-3.5'}
        />
        {accepted ? labels.accepted : labels.declined}
      </span>
    );
  }

  const act = async (action: 'accept' | 'decline') => {
    const wsId = getWorkspaceInviteWorkspaceId(notification);
    if (!wsId) {
      toast.error(labels.actionError);
      return;
    }
    setPending(action);
    try {
      await (action === 'accept'
        ? acceptWorkspaceInvite(wsId)
        : declineWorkspaceInvite(wsId));
      await invalidateWorkspaceInvitationCaches(
        queryClient,
        notification.user_id
      );
      await updateNotificationMetadata(notification.id, {
        action_taken: action === 'accept' ? 'accepted' : 'declined',
        action_timestamp: new Date().toISOString(),
      });
      toast.success(action === 'accept' ? labels.accepted : labels.declined);
      onResolved();
      router.refresh();
    } catch (error) {
      console.error('Notification invite action failed', error);
      toast.error(labels.actionError);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-2 flex gap-1.5">
      <Button
        size="sm"
        className="h-8 gap-1 px-3 text-xs pointer-coarse:min-h-11"
        disabled={!!pending}
        onClick={() => act('accept')}
      >
        {pending === 'accept' ? (
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
        ) : (
          <Check aria-hidden className="size-3.5" />
        )}
        {labels.accept}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-xs pointer-coarse:min-h-11"
        disabled={!!pending}
        onClick={() => act('decline')}
      >
        {pending === 'decline' && (
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
        )}
        {labels.decline}
      </Button>
    </div>
  );
}
