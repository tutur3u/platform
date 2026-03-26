'use client';

import { getCurrentUserProfile } from '@tuturuuu/internal-api';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import type { User } from '@tuturuuu/types/primitives/User';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface PresenceLocation {
  type: 'board' | 'whiteboard' | 'other';
  boardId?: string;
  taskId?: string;
}

export interface WorkspacePresenceState {
  user: User;
  online_at: string;
  session_id?: string;
  location: PresenceLocation;
  away?: boolean;
  metadata?: Record<string, any>;
}

export interface UseWorkspacePresenceConfig {
  wsId: string;
  enabled?: boolean;
  maxPresencePerBoard?: number;
}

export interface UseWorkspacePresenceResult {
  presenceState: RealtimePresenceState<WorkspacePresenceState>;
  currentUserId?: string;
  updateLocation: (
    location: PresenceLocation,
    metadata?: Record<string, any>
  ) => void;
  /** Update metadata only without changing the current location. */
  updateMetadata: (metadata: Record<string, any>) => void;
  getBoardViewers: (boardId: string) => WorkspacePresenceState[];
  getTaskViewers: (taskId: string) => WorkspacePresenceState[];
  getWhiteboardViewers: (boardId: string) => WorkspacePresenceState[];
  getBoardPresenceCount: (boardId: string) => number;
  isBoardOverLimit: (boardId: string) => boolean;
}

const MAX_RETRIES = 3;
const SESSION_STORAGE_SESSION_KEY = 'tuturuuu:workspace-presence:session-id';

function createPresenceSessionId(): string {
  // Prefer Web Crypto API if available
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  // Fallback to Node.js crypto if available
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require('crypto') as
      | { randomUUID?: () => string; randomBytes: (size: number) => Buffer }
      | undefined;

    if (nodeCrypto?.randomUUID) {
      return nodeCrypto.randomUUID();
    }

    if (typeof nodeCrypto?.randomBytes === 'function') {
      return nodeCrypto.randomBytes(16).toString('hex');
    }
  } catch {
    // Ignore and fall through to final fallback
  }

  // Final fallback using Web Crypto getRandomValues if available
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // As a last resort, return a constant-length string derived from Date.now().
  // This path should be effectively unreachable in modern environments, but
  // avoids using Math.random() while still providing a unique-ish identifier.
  return `fallback-${Date.now().toString(36)}`;
}

function getOrCreatePresenceSessionId(): string {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return createPresenceSessionId();
  }

  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_SESSION_KEY);
    if (existing) {
      return existing;
    }

    const next = createPresenceSessionId();
    sessionStorage.setItem(SESSION_STORAGE_SESSION_KEY, next);
    return next;
  } catch {
    return createPresenceSessionId();
  }
}

function buildTrackSignature(
  payload: Omit<WorkspacePresenceState, 'online_at'>
): string {
  return JSON.stringify(payload);
}

/**
 * Workspace-level presence hook with **lazy channel initialization**.
 *
 * The Supabase presence channel is NOT created on mount. It is created the
 * first time `updateLocation` is called (i.e. when the user navigates to a
 * board or opens a task dialog). This avoids unnecessary subscriptions on
 * pages that don't need realtime (settings, user management, etc.).
 */
export function useWorkspacePresence({
  wsId,
  enabled = true,
  maxPresencePerBoard = 10,
}: UseWorkspacePresenceConfig): UseWorkspacePresenceResult {
  const [presenceState, setPresenceState] = useState<
    RealtimePresenceState<WorkspacePresenceState>
  >({});
  const [currentUserId, setCurrentUserId] = useState<string>();

  const channelRef = useRef<any>(null);
  const retryCountRef = useRef(0);
  const isCleanedUpRef = useRef(false);
  const locationRef = useRef<PresenceLocation>({ type: 'other' });
  const metadataRef = useRef<Record<string, any> | undefined>(undefined);
  const awayRef = useRef(false);
  const userDataRef = useRef<User | null>(null);
  const setupPromiseRef = useRef<Promise<boolean> | null>(null);
  const presenceSessionIdRef = useRef<string>(getOrCreatePresenceSessionId());
  const lastTrackSignatureRef = useRef<string | null>(null);
  // Stable ref so subscribe callbacks can call the latest trackPresence
  // without a circular useCallback dependency.
  const trackPresenceRef = useRef<(() => Promise<void>) | null>(null);

  const channelName = `ws-presence-${wsId}`;
  // Derived key that captures both channel identity AND enabled state.
  // When enabled flips to false the key changes, triggering cleanup effects.
  const channelKey = enabled ? channelName : '';

  // ---------------------------------------------------------------------------
  // Lazy channel setup — returns true if channel is ready, false otherwise.
  // Deduplicates concurrent calls via setupPromiseRef.
  // ---------------------------------------------------------------------------
  const ensureChannel = useCallback(async (): Promise<boolean> => {
    // Already set up
    if (channelRef.current) return true;
    if (!channelKey || isCleanedUpRef.current) return false;

    // Deduplicate: if a setup is already in-flight, wait for it
    if (setupPromiseRef.current) return setupPromiseRef.current;

    const promise = (async (): Promise<boolean> => {
      const supabase = createClient();

      try {
        if (isCleanedUpRef.current) return false;

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id || isCleanedUpRef.current) return false;

        // Fetch user profile data once
        if (!userDataRef.current) {
          const userData = await getCurrentUserProfile().catch((error) => {
            if (DEV_MODE) {
              console.error('Error fetching user data:', error);
            }
            return null;
          });

          if (!userData) return false;

          setCurrentUserId(user.id);
          userDataRef.current = {
            id: user.id,
            display_name: userData.display_name,
            email: userData.email,
            avatar_url: userData.avatar_url,
          };
        }

        if (isCleanedUpRef.current) return false;

        // Clean up any stale channel
        if (channelRef.current) {
          await supabase.removeChannel(channelRef.current);
          channelRef.current = null;
          lastTrackSignatureRef.current = null;
        }

        const channel = supabase.channel(channelKey, {
          config: {
            presence: {
              key: user.id,
              enabled: true,
            },
          },
        });

        channelRef.current = channel;

        // Subscribe and wait for SUBSCRIBED status
        return new Promise<boolean>((resolve) => {
          channel
            .on('presence', { event: 'sync' }, () => {
              if (isCleanedUpRef.current) return;
              const newState =
                channel.presenceState() as RealtimePresenceState<WorkspacePresenceState>;
              setPresenceState({ ...newState });
            })
            .on('presence', { event: 'join' }, ({ key }) => {
              if (DEV_MODE) {
                console.log('Workspace presence join:', key);
              }
            })
            .on('presence', { event: 'leave' }, ({ key }) => {
              if (DEV_MODE) {
                console.log('Workspace presence leave:', key);
              }
            })
            .subscribe((status) => {
              if (DEV_MODE) {
                console.log('Workspace presence status:', status);
              }

              switch (status) {
                case 'SUBSCRIBED':
                  retryCountRef.current = 0;
                  resolve(true);
                  break;
                case 'CHANNEL_ERROR':
                case 'TIMED_OUT': {
                  // Clear stale channel so ensureChannel recreates
                  // instead of short-circuiting on the dead reference.
                  const deadCh = channelRef.current;
                  channelRef.current = null;
                  setupPromiseRef.current = null;
                  lastTrackSignatureRef.current = null;
                  if (deadCh) {
                    supabase.removeChannel(deadCh).catch(() => {});
                  }
                  if (
                    retryCountRef.current < MAX_RETRIES &&
                    !isCleanedUpRef.current
                  ) {
                    retryCountRef.current++;
                    setTimeout(() => {
                      trackPresenceRef.current?.();
                    }, 2000 * retryCountRef.current);
                  }
                  resolve(false);
                  break;
                }
                case 'CLOSED': {
                  if (DEV_MODE) {
                    console.info('Workspace presence channel closed');
                  }
                  // The subscribe callback fires CLOSED even after an
                  // earlier SUBSCRIBED (e.g. WebSocket drops). At that
                  // point the promise is already resolved, so
                  // resolve(false) is a no-op — but we still need to
                  // clear the dead channel ref so ensureChannel
                  // recreates on the next call instead of returning
                  // true for a dead channel.
                  if (!isCleanedUpRef.current) {
                    const deadCh = channelRef.current;
                    channelRef.current = null;
                    setupPromiseRef.current = null;
                    lastTrackSignatureRef.current = null;
                    if (deadCh) {
                      supabase.removeChannel(deadCh).catch(() => {});
                    }
                    // Attempt reconnection
                    if (retryCountRef.current < MAX_RETRIES) {
                      retryCountRef.current++;
                      setTimeout(() => {
                        trackPresenceRef.current?.();
                      }, 2000 * retryCountRef.current);
                    }
                  }
                  resolve(false);
                  break;
                }
              }
            });
        });
      } catch (error) {
        if (DEV_MODE) {
          console.error('Error setting up workspace presence:', error);
        }
        channelRef.current = null;
        setupPromiseRef.current = null;
        lastTrackSignatureRef.current = null;
        if (retryCountRef.current < MAX_RETRIES && !isCleanedUpRef.current) {
          retryCountRef.current++;
          setTimeout(() => {
            trackPresenceRef.current?.();
          }, 2000 * retryCountRef.current);
        }
        return false;
      }
    })();

    setupPromiseRef.current = promise;
    return promise;
  }, [channelKey]);

  // ---------------------------------------------------------------------------
  // Cleanup on unmount or when channelKey changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Skip setup when disabled (channelKey is empty)
    if (!channelKey) return;
    isCleanedUpRef.current = false;

    return () => {
      isCleanedUpRef.current = true;
      retryCountRef.current = 0;
      setupPromiseRef.current = null;
      if (channelRef.current) {
        channelRef.current.untrack?.().catch(() => {});
        createClient().removeChannel(channelRef.current);
        channelRef.current = null;
        lastTrackSignatureRef.current = null;
      }
    };
  }, [channelKey]);

  // ---------------------------------------------------------------------------
  // Track presence (sends data to Supabase)
  // ---------------------------------------------------------------------------
  const trackPresence = useCallback(async () => {
    if (isCleanedUpRef.current) return;

    const ready = await ensureChannel();
    if (
      !ready ||
      !channelRef.current ||
      !userDataRef.current ||
      isCleanedUpRef.current
    )
      return;

    try {
      const payload: Omit<WorkspacePresenceState, 'online_at'> = {
        user: userDataRef.current,
        session_id: presenceSessionIdRef.current,
        location: locationRef.current,
        away: awayRef.current,
        metadata: metadataRef.current,
      };

      const nextSignature = buildTrackSignature(payload);
      if (nextSignature === lastTrackSignatureRef.current) {
        return;
      }

      await channelRef.current.track({
        ...payload,
        online_at: new Date().toISOString(),
      });
      lastTrackSignatureRef.current = nextSignature;
    } catch (error) {
      if (DEV_MODE) {
        console.error('Error tracking workspace presence:', error);
      }
    }
  }, [ensureChannel]);

  // Keep ref in sync so subscribe callbacks can call the latest version
  trackPresenceRef.current = trackPresence;

  // ---------------------------------------------------------------------------
  // Public: update location (triggers lazy channel creation + track)
  // ---------------------------------------------------------------------------
  const updateLocation = useCallback(
    async (location: PresenceLocation, metadata?: Record<string, any>) => {
      locationRef.current = location;
      if (metadata !== undefined) metadataRef.current = metadata;
      await trackPresence();
    },
    [trackPresence]
  );

  // ---------------------------------------------------------------------------
  // Public: update metadata without changing location
  // ---------------------------------------------------------------------------
  const updateMetadata = useCallback(
    async (metadata: Record<string, any>) => {
      metadataRef.current = metadata;
      await trackPresence();
    },
    [trackPresence]
  );

  // ---------------------------------------------------------------------------
  // Track page visibility to update away status (only if channel is active)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!channelKey) return;

    const handleVisibilityChange = () => {
      const isAway =
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden';
      if (awayRef.current !== isAway) {
        awayRef.current = isAway;
        // Only send visibility update if channel is already active
        if (channelRef.current) {
          trackPresence();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [channelKey, trackPresence]);

  // ---------------------------------------------------------------------------
  // Derived helpers
  // ---------------------------------------------------------------------------
  const allPresences = useMemo(() => {
    const result: WorkspacePresenceState[] = [];
    for (const presences of Object.values(presenceState)) {
      for (const p of presences) {
        if (p) result.push(p);
      }
    }
    return result;
  }, [presenceState]);

  const getBoardViewers = useCallback(
    (boardId: string): WorkspacePresenceState[] => {
      return allPresences.filter(
        (p) => p.location?.type === 'board' && p.location?.boardId === boardId
      );
    },
    [allPresences]
  );

  const getTaskViewers = useCallback(
    (taskId: string): WorkspacePresenceState[] => {
      return allPresences.filter((p) => p.location?.taskId === taskId);
    },
    [allPresences]
  );

  const getWhiteboardViewers = useCallback(
    (boardId: string): WorkspacePresenceState[] => {
      return allPresences.filter(
        (p) =>
          p.location?.type === 'whiteboard' && p.location?.boardId === boardId
      );
    },
    [allPresences]
  );

  const getBoardPresenceCount = useCallback(
    (boardId: string): number => {
      const userIds = new Set<string>();
      for (const p of allPresences) {
        if (
          (p.location?.type === 'board' || p.location?.type === 'whiteboard') &&
          p.location?.boardId === boardId &&
          p.user.id
        ) {
          userIds.add(p.user.id);
        }
      }
      return userIds.size;
    },
    [allPresences]
  );

  const isBoardOverLimit = useCallback(
    (boardId: string): boolean => {
      return getBoardPresenceCount(boardId) > maxPresencePerBoard;
    },
    [getBoardPresenceCount, maxPresencePerBoard]
  );

  return useMemo(
    () => ({
      presenceState,
      currentUserId,
      updateLocation,
      updateMetadata,
      getBoardViewers,
      getTaskViewers,
      getWhiteboardViewers,
      getBoardPresenceCount,
      isBoardOverLimit,
    }),
    [
      presenceState,
      currentUserId,
      updateLocation,
      updateMetadata,
      getBoardViewers,
      getTaskViewers,
      getWhiteboardViewers,
      getBoardPresenceCount,
      isBoardOverLimit,
    ]
  );
}
