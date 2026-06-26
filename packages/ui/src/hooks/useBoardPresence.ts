'use client';

import { getCurrentUserProfile } from '@tuturuuu/internal-api/users';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import type { User } from '@tuturuuu/types/primitives/User';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  PresenceLocation,
  WorkspacePresenceState,
} from './use-workspace-presence';
import { getBoardRealtimeChannelName } from './useBoardRealtime.types';

type BoardPresenceChannel = ReturnType<
  ReturnType<typeof createClient>['channel']
>;

export type BoardPresenceState = WorkspacePresenceState;

export interface UseBoardPresenceConfig {
  enabled?: boolean;
}

export interface UseBoardPresenceResult {
  presenceState: RealtimePresenceState<BoardPresenceState>;
  currentUserId?: string;
  updateLocation: (
    location: PresenceLocation,
    metadata?: Record<string, any>
  ) => void;
  updateMetadata: (metadata: Record<string, any>) => void;
  getBoardViewers: (boardId: string) => BoardPresenceState[];
  getTaskViewers: (taskId: string) => BoardPresenceState[];
}

const SESSION_STORAGE_SESSION_KEY = 'tuturuuu:board-presence:session-id';
let fallbackBoardPresenceCounter = 0;

function createPresenceSessionId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  fallbackBoardPresenceCounter += 1;
  return `fallback-${Date.now().toString(36)}-${fallbackBoardPresenceCounter}`;
}

function getOrCreatePresenceSessionId(): string {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return createPresenceSessionId();
  }

  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_SESSION_KEY);
    if (existing) return existing;

    const next = createPresenceSessionId();
    sessionStorage.setItem(SESSION_STORAGE_SESSION_KEY, next);
    return next;
  } catch {
    return createPresenceSessionId();
  }
}

function buildTrackSignature(
  payload: Omit<BoardPresenceState, 'online_at'>
): string {
  return JSON.stringify(payload);
}

export function useBoardPresence(
  boardId: string,
  { enabled = true }: UseBoardPresenceConfig = {}
): UseBoardPresenceResult {
  const [presenceState, setPresenceState] = useState<
    RealtimePresenceState<BoardPresenceState>
  >({});
  const [currentUserId, setCurrentUserId] = useState<string>();

  const channelRef = useRef<BoardPresenceChannel | null>(null);
  const isCleanedUpRef = useRef(false);
  const setupPromiseRef = useRef<Promise<boolean> | null>(null);
  const locationRef = useRef<PresenceLocation>({ type: 'other' });
  const metadataRef = useRef<Record<string, any> | undefined>(undefined);
  const awayRef = useRef(false);
  const userDataRef = useRef<User | null>(null);
  const presenceSessionIdRef = useRef<string>(getOrCreatePresenceSessionId());
  const lastTrackSignatureRef = useRef<string | null>(null);

  const channelName =
    enabled && boardId ? getBoardRealtimeChannelName(boardId) : '';

  const ensureChannel = useCallback(async (): Promise<boolean> => {
    if (channelRef.current) return true;
    if (!channelName || isCleanedUpRef.current) return false;
    if (setupPromiseRef.current) return setupPromiseRef.current;

    const promise = (async () => {
      const supabase = createClient();

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id || isCleanedUpRef.current) return false;

        if (!userDataRef.current) {
          const profile = await getCurrentUserProfile().catch((error) => {
            if (DEV_MODE) {
              console.error('Error fetching board presence user data:', error);
            }
            return null;
          });

          if (!profile) return false;

          setCurrentUserId(user.id);
          userDataRef.current = {
            id: user.id,
            display_name: profile.display_name,
            email: profile.email,
            avatar_url: profile.avatar_url,
          };
        }

        if (isCleanedUpRef.current) return false;

        const channel = supabase.channel(channelName, {
          config: {
            presence: {
              enabled: true,
              key: user.id,
            },
            private: true,
          },
        });
        channelRef.current = channel;

        return new Promise<boolean>((resolve) => {
          channel
            .on('presence', { event: 'sync' }, () => {
              if (isCleanedUpRef.current) return;
              const nextState =
                channel.presenceState() as RealtimePresenceState<BoardPresenceState>;
              setPresenceState({ ...nextState });
            })
            .on('presence', { event: 'join' }, ({ key }) => {
              if (DEV_MODE) {
                console.log('Board presence join:', key);
              }
            })
            .on('presence', { event: 'leave' }, ({ key }) => {
              if (DEV_MODE) {
                console.log('Board presence leave:', key);
              }
            })
            .subscribe((status) => {
              if (DEV_MODE) {
                console.log('Board presence status:', status);
              }

              if (status === 'SUBSCRIBED') {
                resolve(true);
                return;
              }

              if (
                status === 'CHANNEL_ERROR' ||
                status === 'TIMED_OUT' ||
                status === 'CLOSED'
              ) {
                const deadChannel = channelRef.current;
                channelRef.current = null;
                setupPromiseRef.current = null;
                lastTrackSignatureRef.current = null;
                if (deadChannel) {
                  supabase.removeChannel(deadChannel).catch(() => {});
                }
                resolve(false);
              }
            });
        });
      } catch (error) {
        if (DEV_MODE) {
          console.error('Error setting up board presence:', error);
        }
        channelRef.current = null;
        setupPromiseRef.current = null;
        lastTrackSignatureRef.current = null;
        return false;
      }
    })();

    setupPromiseRef.current = promise;
    return promise;
  }, [channelName]);

  useEffect(() => {
    if (!channelName) return;
    isCleanedUpRef.current = false;

    return () => {
      isCleanedUpRef.current = true;
      setupPromiseRef.current = null;
      if (channelRef.current) {
        channelRef.current.untrack?.().catch(() => {});
        createClient().removeChannel(channelRef.current);
        channelRef.current = null;
        lastTrackSignatureRef.current = null;
      }
    };
  }, [channelName]);

  const trackPresence = useCallback(async () => {
    if (isCleanedUpRef.current) return;

    const ready = await ensureChannel();
    if (
      !ready ||
      !channelRef.current ||
      !userDataRef.current ||
      isCleanedUpRef.current
    ) {
      return;
    }

    try {
      const payload: Omit<BoardPresenceState, 'online_at'> = {
        user: userDataRef.current,
        session_id: presenceSessionIdRef.current,
        location: locationRef.current,
        away: awayRef.current,
        metadata: metadataRef.current,
      };
      const nextSignature = buildTrackSignature(payload);
      if (nextSignature === lastTrackSignatureRef.current) return;

      await channelRef.current.track({
        ...payload,
        online_at: new Date().toISOString(),
      });
      lastTrackSignatureRef.current = nextSignature;
    } catch (error) {
      if (DEV_MODE) {
        console.error('Error tracking board presence:', error);
      }
    }
  }, [ensureChannel]);

  const updateLocation = useCallback(
    async (location: PresenceLocation, metadata?: Record<string, any>) => {
      locationRef.current = location;
      if (metadata !== undefined) metadataRef.current = metadata;
      await trackPresence();
    },
    [trackPresence]
  );

  const updateMetadata = useCallback(
    async (metadata: Record<string, any>) => {
      metadataRef.current = metadata;
      await trackPresence();
    },
    [trackPresence]
  );

  useEffect(() => {
    if (!channelName) return;

    const handleVisibilityChange = () => {
      const isAway =
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden';
      if (awayRef.current === isAway) return;

      awayRef.current = isAway;
      if (channelRef.current) {
        void trackPresence();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [channelName, trackPresence]);

  const allPresences = useMemo(() => {
    const latestBySession = new Map<string, BoardPresenceState>();

    for (const [presenceKey, presences] of Object.entries(presenceState)) {
      for (const presence of presences) {
        if (!presence) continue;

        const userId = presence.user?.id || presenceKey;
        if (!userId) continue;

        const sessionId =
          presence.session_id ||
          (presence as { presence_ref?: string }).presence_ref ||
          `${userId}:${presenceKey}`;
        const dedupeKey = `${userId}:${sessionId}`;

        const existing = latestBySession.get(dedupeKey);
        if (!existing) {
          latestBySession.set(dedupeKey, presence);
          continue;
        }

        const existingTimestamp = Date.parse(existing.online_at);
        const nextTimestamp = Date.parse(presence.online_at);
        const shouldReplace = Number.isFinite(nextTimestamp)
          ? !Number.isFinite(existingTimestamp) ||
            nextTimestamp >= existingTimestamp
          : !Number.isFinite(existingTimestamp);

        if (shouldReplace) {
          latestBySession.set(dedupeKey, presence);
        }
      }
    }

    return Array.from(latestBySession.values());
  }, [presenceState]);

  const getBoardViewers = useCallback(
    (viewerBoardId: string) =>
      allPresences.filter(
        (presence) =>
          presence.location?.type === 'board' &&
          presence.location?.boardId === viewerBoardId
      ),
    [allPresences]
  );

  const getTaskViewers = useCallback(
    (taskId: string) =>
      allPresences.filter((presence) => presence.location?.taskId === taskId),
    [allPresences]
  );

  return useMemo(
    () => ({
      presenceState,
      currentUserId,
      updateLocation,
      updateMetadata,
      getBoardViewers,
      getTaskViewers,
    }),
    [
      presenceState,
      currentUserId,
      updateLocation,
      updateMetadata,
      getBoardViewers,
      getTaskViewers,
    ]
  );
}
