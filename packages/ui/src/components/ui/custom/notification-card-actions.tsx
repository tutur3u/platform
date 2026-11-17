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
import type { NotificationStack } from './notification-grouping';
import type { NotificationLabels } from './notification-labels';
import { useNotificationRuntime } from './notification-runtime';
import {
  navigateToNotificationTarget,
  resolveNotificationTarget,
} from './notification-targets';
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

/** Longest wait for the read request before opening another app. */
const MARK_READ_HEAD_START_MS = 1500;

/**
 * Open and invite handlers shared by every notification list. Opening a row
 * marks it read, giving the read request a bounded head start before a
 * cross-app navigation that could cancel it; a row with nothing to open
 * keeps its state.
 */
export function useNotificationRowActions({
  routeWsId,
  onToggle,
  onNavigate,
}: {
  routeWsId?: string;
  onToggle: (stack: NotificationStack, read: boolean) => void | Promise<void>;
  onNavigate: () => void;
}) {
  const { target, open, opening, hostApp } = useNotificationOpen(routeWsId);
  const openStack = useCallback(
    async (stack: NotificationStack) => {
      const to = target(stack.lead);
      if (!to) return;
      const marking = stack.unread ? onToggle(stack, true) : undefined;
      if (marking && to.kind === 'link')
        await Promise.race([
          marking,
          new Promise((resolve) =>
            setTimeout(resolve, MARK_READ_HEAD_START_MS)
          ),
        ]);
      if (await open(stack.lead)) onNavigate();
    },
    [onToggle, open, onNavigate, target]
  );
  const resolveInvite = useCallback(
    (stack: NotificationStack) => {
      if (stack.unread) onToggle(stack, true);
      onNavigate();
    },
    [onToggle, onNavigate]
  );
  return { target, opening, openStack, resolveInvite, hostApp };
}

/** Where a notification leads, if anywhere: the exact item in its app. */
export function useNotificationOpen(routeWsId?: string) {
  const { hostApp, router } = useNotificationRuntime();
  const [opening, setOpening] = useState<string | null>(null);

  const target = useCallback(
    (n: Notification) =>
      resolveNotificationTarget(n, {
        routeWsId,
        currentOrigin:
          typeof window === 'undefined' ? undefined : window.location.origin,
      }),
    [routeWsId]
  );

  const open = useCallback(
    async (n: Notification) => {
      const to = target(n);
      if (!to) return false;
      if (to.kind === 'task') {
        // A host that already shows this workspace's tasks opens the task in
        // place; otherwise the Tasks app opens it.
        setOpening(n.id);
        try {
          const { handled, requestId } = dispatchRequestOpenTask({
            taskId: to.taskId,
            wsId: to.wsId,
          });
          if (handled && (await waitForTaskOpenResult(requestId, 6000)))
            return true;
        } finally {
          setOpening(null);
        }
      }
      if (hostApp === 'mail' && to.app === 'mail') {
        const url = new URL(to.href, window.location.origin);
        router.push(`${url.pathname}${url.search}${url.hash}`);
        return true;
      }
      navigateToNotificationTarget(to.href);
      return true;
    },
    [target, hostApp, router]
  );

  return { target, open, opening, hostApp };
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
