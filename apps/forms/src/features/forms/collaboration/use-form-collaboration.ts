'use client';

import {
  createRealtimeClient,
  type RealtimePresenceState,
} from '@tuturuuu/supabase/next/realtime-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEV_MODE } from '@/constants/common';
import {
  FORM_STUDIO_EVENTS,
  type FormCollaboratorIdentity,
  type FormCollaboratorPresence,
  type FormSavedBroadcast,
  getFormStudioChannelName,
} from './channel';

type StudioChannel = ReturnType<
  ReturnType<typeof createRealtimeClient>['channel']
>;

const SESSION_STORAGE_KEY = 'tuturuuu:form-studio:session-id';

export interface UseFormCollaborationOptions {
  /** Omitted while creating a form — there is no id to scope a channel to. */
  formId?: string;
  /**
   * The local editor, resolved on the server from the app session.
   *
   * Registered satellites must not read Supabase auth in the browser (the
   * `internal-app-auth` guard enforces this), so identity is passed in rather
   * than looked up here — the same shape `NotificationPopover` already uses.
   */
  currentUser: FormCollaboratorIdentity | null;
  enabled?: boolean;
  /** Fired when another editor saves, so the caller can refetch. */
  onRemoteSave?: (payload: FormSavedBroadcast) => void;
}

export interface UseFormCollaborationResult {
  /** Everyone in the session except the local user, most recent first. */
  collaborators: FormCollaboratorPresence[];
  currentUserId: string | null;
  isConnected: boolean;
  /** Reports which block the local user is editing. `null` clears it. */
  setActiveBlock: (blockId: string | null, blockLabel?: string | null) => void;
  /** Tells other editors the form was just persisted. */
  broadcastSaved: () => void;
  /** Collaborators currently focused on a given block. */
  getBlockEditors: (blockId: string) => FormCollaboratorPresence[];
}

function createSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `fallback-${Date.now().toString(36)}-${Math.round(Math.random() * 1e9)}`;
}

/**
 * One tab keeps one session id for its lifetime, so a re-render or a
 * reconnection does not present the same person as two collaborators.
 */
function getOrCreateSessionId() {
  if (typeof sessionStorage === 'undefined') {
    return createSessionId();
  }

  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;

    const next = createSessionId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return createSessionId();
  }
}

/**
 * Live presence and save notifications for the form studio.
 *
 * The forms tables sit in the `private` schema with service-role-only access,
 * so `postgres_changes` is not available here — this uses a private Broadcast +
 * Presence channel instead, authorized by `realtime.messages` policies that
 * check `manage_forms` on the form's workspace.
 *
 * Deliberately not an operational-transform layer: the studio autosaves whole
 * documents, so the useful signals are "who else is here", "which block are
 * they in" and "the server copy just changed" — enough to stop two people
 * silently overwriting each other, without pretending edits merge.
 */
export function useFormCollaboration({
  formId,
  currentUser,
  enabled = true,
  onRemoteSave,
}: UseFormCollaborationOptions): UseFormCollaborationResult {
  const [presenceState, setPresenceState] = useState<
    RealtimePresenceState<FormCollaboratorPresence>
  >({});
  const [isConnected, setIsConnected] = useState(false);
  const currentUserId = currentUser?.id ?? null;

  const channelRef = useRef<StudioChannel | null>(null);
  const identityRef = useRef<FormCollaboratorIdentity | null>(currentUser);
  identityRef.current = currentUser;
  const sessionIdRef = useRef<string>('');
  const blockRef = useRef<{ id: string | null; label: string | null }>({
    id: null,
    label: null,
  });
  const awayRef = useRef(false);
  const disposedRef = useRef(false);
  // `onRemoteSave` is usually an inline closure; keeping it in a ref stops the
  // channel from being torn down and rebuilt on every parent render.
  const onRemoteSaveRef = useRef(onRemoteSave);
  onRemoteSaveRef.current = onRemoteSave;

  const channelName = enabled && formId ? getFormStudioChannelName(formId) : '';

  const track = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel || !identityRef.current || disposedRef.current) return;

    try {
      await channel.track({
        user: identityRef.current,
        sessionId: sessionIdRef.current,
        blockId: blockRef.current.id,
        blockLabel: blockRef.current.label,
        away: awayRef.current,
        onlineAt: new Date().toISOString(),
      } satisfies FormCollaboratorPresence);
    } catch (error) {
      if (DEV_MODE) {
        console.error('Form studio presence track failed:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (!(channelName && currentUserId)) {
      setIsConnected(false);
      return;
    }

    disposedRef.current = false;
    sessionIdRef.current = getOrCreateSessionId();
    const supabase = createRealtimeClient();

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
        presence: { enabled: true, key: currentUserId },
        private: true,
      },
    });
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        if (disposedRef.current) return;
        setPresenceState({
          ...(channel.presenceState() as RealtimePresenceState<FormCollaboratorPresence>),
        });
      })
      .on(
        'broadcast',
        { event: FORM_STUDIO_EVENTS.saved },
        ({ payload }: { payload: FormSavedBroadcast }) => {
          if (disposedRef.current) return;
          onRemoteSaveRef.current?.(payload);
        }
      )
      .subscribe((status) => {
        if (disposedRef.current) return;

        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          void track();
          return;
        }

        // CHANNEL_ERROR here usually means the `realtime.messages` policy
        // denied the topic. Collaboration is additive, so the studio keeps
        // working with presence simply switched off rather than surfacing an
        // error the editor cannot act on.
        setIsConnected(false);
        if (DEV_MODE && status === 'CHANNEL_ERROR') {
          console.warn('Form studio channel rejected:', channelName);
        }
      });

    return () => {
      disposedRef.current = true;
      setIsConnected(false);
      setPresenceState({});

      channelRef.current = null;
      channel.untrack?.().catch(() => {});
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [channelName, currentUserId, track]);

  // A tab left open in the background should dim rather than disappear:
  // vanishing and reappearing reads as a connection problem.
  useEffect(() => {
    if (!channelName) return;

    const onVisibilityChange = () => {
      const away = document.visibilityState === 'hidden';
      if (awayRef.current === away) return;

      awayRef.current = away;
      void track();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [channelName, track]);

  const setActiveBlock = useCallback(
    (blockId: string | null, blockLabel: string | null = null) => {
      if (
        blockRef.current.id === blockId &&
        blockRef.current.label === blockLabel
      ) {
        return;
      }

      blockRef.current = { id: blockId, label: blockLabel };
      void track();
    },
    [track]
  );

  const broadcastSaved = useCallback(() => {
    const channel = channelRef.current;
    const identity = identityRef.current;
    if (!(channel && identity && formId)) return;

    channel
      .send({
        type: 'broadcast',
        event: FORM_STUDIO_EVENTS.saved,
        payload: {
          formId,
          actorId: identity.id,
          actorName: identity.displayName,
          savedAt: new Date().toISOString(),
        } satisfies FormSavedBroadcast,
      })
      .catch((error) => {
        if (DEV_MODE) {
          console.error('Form studio save broadcast failed:', error);
        }
      });
  }, [formId]);

  const collaborators = useMemo(() => {
    const bySession = new Map<string, FormCollaboratorPresence>();

    for (const entries of Object.values(presenceState)) {
      for (const entry of entries) {
        if (!entry?.user?.id || entry.user.id === currentUserId) continue;

        // Presence is keyed by user id, so a person with two tabs open arrives
        // as two entries under one key. Keep the most recent per tab.
        const key = `${entry.user.id}:${entry.sessionId}`;
        const existing = bySession.get(key);
        if (!existing || existing.onlineAt <= entry.onlineAt) {
          bySession.set(key, entry);
        }
      }
    }

    return [...bySession.values()].sort((left, right) =>
      right.onlineAt.localeCompare(left.onlineAt)
    );
  }, [currentUserId, presenceState]);

  const getBlockEditors = useCallback(
    (blockId: string) =>
      collaborators.filter(
        (collaborator) => !collaborator.away && collaborator.blockId === blockId
      ),
    [collaborators]
  );

  return {
    broadcastSaved,
    collaborators,
    currentUserId,
    getBlockEditors,
    isConnected,
    setActiveBlock,
  };
}
