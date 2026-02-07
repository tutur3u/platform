'use client';

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
  location: PresenceLocation;
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
  getBoardViewers: (boardId: string) => WorkspacePresenceState[];
  getTaskViewers: (taskId: string) => WorkspacePresenceState[];
  getWhiteboardViewers: (boardId: string) => WorkspacePresenceState[];
  getBoardPresenceCount: (boardId: string) => number;
  isBoardOverLimit: (boardId: string) => boolean;
}

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
  const userDataRef = useRef<User | null>(null);
  const MAX_RETRIES = 3;

  const channelName = `ws-presence-${wsId}`;

  useEffect(() => {
    if (!enabled || !wsId) return;
    isCleanedUpRef.current = false;

    const supabase = createClient();

    const setupPresence = async () => {
      if (isCleanedUpRef.current) return;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) return;

        const { data: userData, error: userDataError } = await supabase
          .from('users')
          .select('display_name, avatar_url')
          .eq('id', user.id)
          .single();

        if (userDataError) {
          if (DEV_MODE) {
            console.error('Error fetching user data:', userDataError);
          }
          return;
        }

        setCurrentUserId(user.id);
        userDataRef.current = {
          id: user.id,
          display_name: userData?.display_name,
          email: user.email,
          avatar_url: userData?.avatar_url,
        };

        // Clean up existing channel
        if (channelRef.current) {
          await supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }

        const channel = supabase.channel(channelName, {
          config: {
            presence: {
              key: user.id,
              enabled: true,
            },
          },
        });

        channelRef.current = channel;

        channel
          .on('presence', { event: 'sync' }, () => {
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
          .subscribe(async (status) => {
            if (DEV_MODE) {
              console.log('Workspace presence status:', status);
            }

            switch (status) {
              case 'SUBSCRIBED': {
                const trackStatus = await channel.track({
                  user: userDataRef.current!,
                  online_at: new Date().toISOString(),
                  location: locationRef.current,
                  metadata: metadataRef.current,
                });

                if (trackStatus === 'timed out' && !isCleanedUpRef.current) {
                  setTimeout(async () => {
                    if (!isCleanedUpRef.current && channelRef.current) {
                      await channelRef.current.track({
                        user: userDataRef.current!,
                        online_at: new Date().toISOString(),
                        location: locationRef.current,
                        metadata: metadataRef.current,
                      });
                    }
                  }, 1000);
                }

                retryCountRef.current = 0;
                break;
              }
              case 'CHANNEL_ERROR':
              case 'TIMED_OUT':
                if (
                  retryCountRef.current < MAX_RETRIES &&
                  !isCleanedUpRef.current
                ) {
                  retryCountRef.current++;
                  setTimeout(() => {
                    setupPresence();
                  }, 2000 * retryCountRef.current);
                }
                break;
              case 'CLOSED':
                if (DEV_MODE) {
                  console.info('Workspace presence channel closed');
                }
                break;
            }
          });
      } catch (error) {
        if (DEV_MODE) {
          console.error('Error setting up workspace presence:', error);
        }
        if (retryCountRef.current < MAX_RETRIES && !isCleanedUpRef.current) {
          retryCountRef.current++;
          setTimeout(() => {
            setupPresence();
          }, 2000 * retryCountRef.current);
        }
      }
    };

    setupPresence();

    return () => {
      isCleanedUpRef.current = true;
      retryCountRef.current = 0;
      if (channelRef.current) {
        createClient().removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [channelName, enabled, wsId]);

  const updateLocation = useCallback(
    async (location: PresenceLocation, metadata?: Record<string, any>) => {
      locationRef.current = location;
      metadataRef.current = metadata;

      if (!channelRef.current || !userDataRef.current || isCleanedUpRef.current)
        return;

      try {
        await channelRef.current.track({
          user: userDataRef.current,
          online_at: new Date().toISOString(),
          location,
          metadata,
        });
      } catch (error) {
        if (DEV_MODE) {
          console.error('Error updating workspace presence location:', error);
        }
      }
    },
    []
  );

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
      // Deduplicate by user id
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

  return {
    presenceState,
    currentUserId,
    updateLocation,
    getBoardViewers,
    getTaskViewers,
    getWhiteboardViewers,
    getBoardPresenceCount,
    isBoardOverLimit,
  };
}
