'use client';
import {
  getMeetCallRoomState,
  restoreMeetCallRoom,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { forgetEndedRoom } from '../lib/ended-room-cache';

type Scope = { accountId: string; meetingId: string; attempt: object | null };
export function RestoreRoomButton({
  accountId,
  meetingId,
  disabled,
  onRestored = () => window.location.reload(),
}: {
  accountId: string;
  meetingId: string;
  disabled?: boolean;
  onRestored?: () => void;
}) {
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
  return (
    <div className="space-y-2">
      <Button
        onClick={() => void restore()}
        disabled={disabled || currentStatus?.pending}
      >
        {t(currentStatus?.pending ? 'restoring_call' : 'restore_call')}
      </Button>
      {currentStatus?.error && (
        <p role="alert" className="text-destructive text-sm">
          {currentStatus.error}
        </p>
      )}
    </div>
  );
}
