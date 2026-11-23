'use client';
import {
  getMeetCallRoomState,
  restoreMeetCallRoom,
} from '@tuturuuu/internal-api';
import { Button, type ButtonProps } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { forgetEndedRoom } from '../lib/ended-room-cache';

type Scope = { accountId: string; meetingId: string; attempt: object | null };

/**
 * Restore state and the restore call. Mount it outside any menu or popover
 * content so closing that surface cannot cancel an attempt in flight.
 */
export function useRestoreRoom(
  accountId: string,
  meetingId: string,
  onRestored: () => void = () => window.location.reload()
) {
  const t = useTranslations('meet.call');
  const scope = useRef<Scope>({ accountId, meetingId, attempt: null });
  if (
    scope.current.accountId !== accountId ||
    scope.current.meetingId !== meetingId
  )
    scope.current = { accountId, meetingId, attempt: null };
  const [status, setStatus] = useState<{
    scope: Scope;
    pending: boolean;
    error?: string;
  } | null>(null);
  useEffect(
    () => () => {
      scope.current.attempt = null;
    },
    []
  );
  const currentStatus = status?.scope === scope.current ? status : null;
  async function restore() {
    const current = scope.current;
    if (current.attempt) return;
    const attempt = {};
    current.attempt = attempt;
    const active = () =>
      scope.current === current && current.attempt === attempt;
    setStatus({ scope: current, pending: true });
    try {
      const state = await getMeetCallRoomState(current.meetingId);
      if (!active()) return;
      if (state.ended) {
        await restoreMeetCallRoom(
          current.meetingId,
          state.lifecycleVersion,
          current.accountId
        );
        if (!active()) return;
      }
      forgetEndedRoom(current.accountId, current.meetingId);
      onRestored();
    } catch {
      if (active())
        setStatus({
          scope: current,
          pending: false,
          error: t('restore_failed'),
        });
    } finally {
      if (active()) {
        current.attempt = null;
        setStatus((previous) =>
          previous?.scope === current
            ? { ...previous, pending: false }
            : previous
        );
      }
    }
  }
  return {
    restore: () => void restore(),
    pending: currentStatus?.pending ?? false,
    error: currentStatus?.error,
  };
}

export function RestoreRoomButton({
  accountId,
  meetingId,
  disabled,
  variant,
  size,
  onRestored,
}: {
  accountId: string;
  meetingId: string;
  disabled?: boolean;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  onRestored?: () => void;
}) {
  const t = useTranslations('meet.call');
  const { restore, pending, error } = useRestoreRoom(
    accountId,
    meetingId,
    onRestored
  );
  return (
    <div className="space-y-2">
      <Button
        variant={variant}
        size={size}
        onClick={restore}
        disabled={disabled || pending}
      >
        {t(pending ? 'restoring_call' : 'restore_call')}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
