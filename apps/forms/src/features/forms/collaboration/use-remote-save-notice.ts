'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';
import type { FormSavedBroadcast } from './channel';

/**
 * Reacts to another editor saving the form.
 *
 * The studio holds the whole document in a react-hook-form instance, so
 * refetching on every remote save would silently discard whatever the local
 * editor has typed since their last save. The rule is therefore:
 *
 * - local form clean → refresh straight away; there is nothing to lose and the
 *   editor should not keep working against a stale copy
 * - local form dirty → surface a toast and let them decide when to reload,
 *   because only they know whether their in-progress edit or the incoming one
 *   should win
 *
 * Notices are throttled per actor: autosave fires every couple of seconds while
 * someone types, and a toast per keystroke-batch would be unusable.
 */
const NOTICE_THROTTLE_MS = 15_000;

export function useRemoteSaveNotice({
  isDirty,
  onReload,
}: {
  isDirty: boolean;
  /** Refetch hook; falls back to a router refresh when omitted. */
  onReload?: () => void;
}) {
  const t = useTranslations('forms');
  const router = useRouter();
  const lastNoticeRef = useRef<Map<string, number>>(new Map());
  // Read through refs so the callback identity stays stable — it is handed to
  // a realtime subscription that should not resubscribe on every render.
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const onReloadRef = useRef(onReload);
  onReloadRef.current = onReload;

  const reload = useCallback(() => {
    if (onReloadRef.current) {
      onReloadRef.current();
      return;
    }
    router.refresh();
  }, [router]);

  return useCallback(
    (payload: FormSavedBroadcast) => {
      if (!isDirtyRef.current) {
        reload();
        return;
      }

      const now = Date.now();
      const last = lastNoticeRef.current.get(payload.actorId) ?? 0;
      if (now - last < NOTICE_THROTTLE_MS) {
        return;
      }
      lastNoticeRef.current.set(payload.actorId, now);

      toast.warning(
        t('collaboration.remote_save_title', { name: payload.actorName }),
        {
          description: t('collaboration.remote_save_description'),
          duration: 12_000,
          action: {
            label: t('collaboration.remote_save_reload'),
            onClick: reload,
          },
        }
      );
    },
    [reload, t]
  );
}
