'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  RealtimeChannel,
  RealtimePresenceState,
} from '@tuturuuu/supabase/next/realtime';
import type { User } from '@tuturuuu/types/primitives/User';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface TaskViewerPresenceState {
  presence_ref: string;
  user: User;
  online_at: string;
  taskId: string;
}

interface TaskViewerContextValue {
  viewTask: (taskId: string) => void;
  unviewTask: (taskId: string) => void;
  getTaskViewers: (
    taskId: string
  ) => RealtimePresenceState<TaskViewerPresenceState>;
  currentUserId?: string;
  taskViewersMap: Map<string, RealtimePresenceState<TaskViewerPresenceState>>;
}

const TaskViewerContext = createContext<TaskViewerContextValue | null>(null);

/**
 * Provider that tracks viewers on a board using a single channel per board.
 * Multiple tasks can display the same board presence state.
 */
export function TaskViewerProvider({
  boardId,
  enabled,
  children,
}: {
  boardId: string;
  enabled: boolean;
  children: ReactNode;
}) {
  // Map structure: taskId -> RealtimePresenceState<TaskViewerPresenceState>
  const [taskViewersMap, setTaskViewersMap] = useState<
    Map<string, RealtimePresenceState<TaskViewerPresenceState>>
  >(new Map());
  const [currentUserId, setCurrentUserId] = useState<string>();

  // Single channel per board
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userDataRef = useRef<User | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  // Initialize channel once on mount
  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channelName = `task-viewer-${boardId}`;

    const initializeChannel = async () => {
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
          display_name: userData.display_name,
          email: user.email,
          avatar_url: userData.avatar_url,
        };

        const channel = supabase.channel(channelName, {
          config: {
            presence: {
              key: user.id,
              enabled: true,
            },
          },
        });

        channelRef.current = channel;
        retryCountRef.current = 0;

        channel
          .on('presence', { event: 'sync' }, () => {
            const newState = channel.presenceState();

            const taskViewers = new Map<
              string,
              RealtimePresenceState<TaskViewerPresenceState>
            >();

            for (const [userId, presences] of Object.entries(newState)) {
              for (const presence of presences as TaskViewerPresenceState[]) {
                const tid = presence.taskId;
                if (tid) {
                  if (!taskViewers.has(tid)) {
                    taskViewers.set(tid, {});
                  }
                  const viewers = taskViewers.get(tid)!;
                  if (!viewers[userId]) viewers[userId] = [];
                  viewers[userId].push(presence);
                }
              }
            }

            setTaskViewersMap(taskViewers);
          })
          .on('presence', { event: 'join' }, ({ key }) => {
            if (DEV_MODE) {
              console.log(`👋 User joined board ${boardId}:`, key);
            }
          })
          .on('presence', { event: 'leave' }, ({ key }) => {
            if (DEV_MODE) {
              console.log(`👋 User left board ${boardId}:`, key);
            }
          })
          .subscribe(async (status: string) => {
            if (DEV_MODE) {
              console.log(`📡 Board ${boardId} channel status:`, status);
            }

            switch (status) {
              case 'SUBSCRIBED': {
                // Channel is ready, but don't track any task yet
                if (DEV_MODE) {
                  console.log(`✅ Board ${boardId} channel subscribed`);
                }
                // Reset retry count on success
                retryCountRef.current = 0;
                break;
              }
              case 'CHANNEL_ERROR':
                if (DEV_MODE) {
                  console.error(`❌ Board ${boardId} channel error:`, status);
                }
                break;
              case 'TIMED_OUT': {
                if (DEV_MODE) {
                  console.warn(`⚠️ Board ${boardId} channel timed out:`, status);
                }
                if (retryCountRef.current < MAX_RETRIES) {
                  retryCountRef.current++;
                  if (DEV_MODE) {
                    console.log(
                      `Retrying board ${boardId} presence setup (${retryCountRef.current}/${MAX_RETRIES})...`
                    );
                  }
                  setTimeout(() => {
                    initializeChannel();
                  }, 2000 * retryCountRef.current);
                }
                break;
              }
              case 'CLOSED':
                if (DEV_MODE) {
                  console.info(`📡 Board ${boardId} channel closed`);
                }
                break;
            }
          });
      } catch (error) {
        if (DEV_MODE) {
          console.error(`Error setting up board ${boardId} presence:`, error);
        }

        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          setTimeout(() => {
            initializeChannel();
          }, 2000 * retryCountRef.current);
        }
      }
    };

    initializeChannel();

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [boardId, enabled]);

  // Function to start tracking a task
  const viewTask = useCallback(
    async (taskId: string) => {
      if (!enabled || !channelRef.current || !userDataRef.current) return;

      try {
        const presenceTrackStatus = await channelRef.current.track({
          user: userDataRef.current,
          online_at: new Date().toISOString(),
          taskId,
        });

        if (DEV_MODE) {
          console.log(`👁️ Viewing task ${taskId}:`, presenceTrackStatus);
        }

        if (presenceTrackStatus === 'timed out') {
          if (DEV_MODE) {
            console.warn(
              `⚠️ Task ${taskId} presence tracking timed out, retrying...`
            );
          }
          // Retry once
          setTimeout(async () => {
            if (channelRef.current) {
              await channelRef.current.track({
                user: userDataRef.current,
                online_at: new Date().toISOString(),
                taskId,
              });
            }
          }, 1000);
        }
      } catch (error) {
        if (DEV_MODE) {
          console.error(`Error tracking task ${taskId}:`, error);
        }
      }
    },
    [enabled]
  );

  // Function to stop tracking
  const unviewTask = useCallback(
    async (taskId: string): Promise<void> => {
      if (!enabled || !channelRef.current || !userDataRef.current) return;

      try {
        await channelRef.current.untrack();

        if (DEV_MODE) {
          console.log(`👁️ Stopped viewing task ${taskId}`);
        }
      } catch (error) {
        if (DEV_MODE) {
          console.error('Error untracking task:', error);
        }
      }
    },
    [enabled]
  );

  // Function to get viewers for a task
  const getTaskViewers = useCallback(
    (taskId: string): RealtimePresenceState<TaskViewerPresenceState> => {
      if (!enabled) return {};

      return taskViewersMap.get(taskId) || {};
    },
    [taskViewersMap, enabled]
  );

  const value: TaskViewerContextValue = {
    viewTask,
    unviewTask,
    getTaskViewers,
    currentUserId,
    taskViewersMap,
  };

  if (!enabled) return children;

  return (
    <TaskViewerContext.Provider value={value}>
      {children}
    </TaskViewerContext.Provider>
  );
}

export function useTaskViewerContext(): TaskViewerContextValue {
  const context = useContext(TaskViewerContext);

  if (!context) {
    throw new Error(
      'useTaskViewerContext must be used within a TaskViewerProvider'
    );
  }

  return context;
}
