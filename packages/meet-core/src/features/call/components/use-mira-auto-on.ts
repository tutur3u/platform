'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import type { useRoomMira } from './use-room-mira';

const notices = new Map<string, string>();

function rememberedNotice(key: string) {
  if (notices.has(key)) return notices.get(key);
  try {
    return sessionStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function rememberNotice(key: string, text: string) {
  notices.set(key, text);
  try {
    sessionStorage.setItem(key, text);
  } catch {
    // The in-memory record still covers this tab.
  }
}

export function useMiraAutoOn({
  meetingId,
  accountId,
  mira,
  deferred,
}: {
  meetingId: string;
  accountId?: string;
  mira: ReturnType<typeof useRoomMira>;
  deferred: boolean;
}) {
  const t = useTranslations('meet.mira_consent');
  const { data, dataUpdatedAt, noticeKnown, choosing, turningOn } = mira;
  const { mutate: choose } = mira.choose;
  const scope = accountId ? `mira-auto-on:${meetingId}:${accountId}` : undefined;
  const off = useRef({ scope, choose });
  off.current = { scope, choose };
  const lastAttempt = useRef<{
    scope: string;
    revision: number;
    read: number;
    count: number;
  } | null>(null);

  useEffect(() => {
    const acceptance = data?.acceptance;
    if (
      !scope ||
      data?.accountConfirmation !== 'confirmed' ||
      !acceptance?.accountConfirmationRequired ||
      data.lastChoice === 'off' ||
      data.pausing ||
      data.autoJoinBlocked ||
      !noticeKnown ||
      deferred ||
      (data.choice !== null && data.choice !== 'on')
    )
      return;

    const text = t('indicator_on', { name: acceptance.acceptorName });
    const shown = rememberedNotice(scope);
    if (shown === undefined) {
      toast.message(text, {
        duration: 15_000,
        action: {
          label: t('turn_off_for_me'),
          onClick: () => {
            if (off.current.scope === scope)
              off.current.choose({
                choice: 'off',
                source: 'toggle',
                noticeText: text,
              });
          },
        },
      });
      rememberNotice(scope, text);
    }
    // A later revision can use the notice already shown only if its text
    // still matches. A different acceptor or locale needs an explicit choice.
    if (
      (shown !== undefined && shown !== text) ||
      data.choice === 'on' ||
      choosing ||
      turningOn
    )
      return;

    const { revision } = acceptance;
    const last = lastAttempt.current;
    const previous =
      last && last.scope === scope && last.revision === revision ? last : null;
    if (previous && (previous.read === dataUpdatedAt || previous.count >= 5))
      return;
    lastAttempt.current = {
      scope,
      revision,
      read: dataUpdatedAt,
      count: (previous?.count ?? 0) + 1,
    };
    choose({ choice: 'on', source: 'auto_on', noticeText: text });
  }, [
    choose,
    choosing,
    data,
    dataUpdatedAt,
    deferred,
    noticeKnown,
    scope,
    t,
    turningOn,
  ]);
}
