'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { RealtimePresenceState } from '@tuturuuu/supabase/next/realtime';
import type { User } from '@tuturuuu/types/primitives/User';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

export interface UserPresenceState {
  user: User;
  online_at: string;
  taskId: string;
}

interface TaskViewerContextValue {
  viewTask: (taskId: string, boardId: string) => void;
  unviewTask: () => void;
  getTaskViewers: (taskId: string) => RealtimePresenceState<UserPresenceState>;
  currentUserId?: string;
  taskViewersMap: Map<string, RealtimePresenceState<UserPresenceState>>;
}

const TaskViewerContext = createContext<TaskViewerContextValue | null>(null);

/**
 * Provider that tracks viewers on a board using a single channel per board.
 * Multiple tasks can display the same board presence state.
 */
export function TaskViewerProvider({ children }: { children: ReactNode }) {
  // Map structure: taskId -> RealtimePresenceState<UserPresenceState>
  const [taskViewersMap, setTaskViewersMap] = useState<
    Map<string, RealtimePresenceState<UserPresenceState>>
  >(new Map());
  const [currentUserId, setCurrentUserId] = useState<string>();

  // Single channel per board
  const channelRef = useRef<any>(null);
  const retryCountRef = useRef(0);
  const isCleanedUpRef = useRef(false);
  const MAX_RETRIES = 3;

  // Function to set up presence tracking for a board
  const setupTaskViewer = useCallback(
    async (boardId: string, taskId: string) => {
      if (isCleanedUpRef.current) return;

      const supabase = createClient();
      const channelName = `task-viewer:${boardId}`;

      // Clean up existing channel if switching boards
      if (channelRef.current && channelRef.current.topic === channelName) {
        await supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

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
              RealtimePresenceState<UserPresenceState>
            >();

            for (const [userId, presences] of Object.entries(newState)) {
              for (const presence of presences as any[]) {
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
          .on(
            'presence',
            { event: 'join' },
            ({ key }: { key: string; newPresences: unknown[] }) => {
              if (DEV_MODE) {
                console.log(`👋 User joined board ${boardId}:`, key);
              }
            }
          )
          .on(
            'presence',
            { event: 'leave' },
            ({ key }: { key: string; leftPresences: unknown[] }) => {
              if (DEV_MODE) {
                console.log(`👋 User left board ${boardId}:`, key);
              }
            }
          )
          .subscribe(async (status: string) => {
            if (DEV_MODE) {
              console.log(`📡 Board ${boardId} channel status:`, status);
            }

            switch (status) {
              case 'SUBSCRIBED': {
                const presenceTrackStatus = await channel.track({
                  user: {
                    id: currentUserId,
                    display_name: userData.display_name,
                    email: userData.email,
                    avatar_url: userData.avatar_url,
                  },
                  online_at: new Date().toISOString(),
                  taskId,
                });

                if (DEV_MODE) {
                  console.log(
                    `Board ${boardId} presence track status:`,
                    presenceTrackStatus
                  );
                }

                if (
                  presenceTrackStatus === 'timed out' &&
                  !isCleanedUpRef.current
                ) {
                  if (DEV_MODE) {
                    console.warn(
                      `⚠️ Board ${boardId} presence tracking timed out, retrying...`
                    );
                  }
                  setTimeout(async () => {
                    if (!isCleanedUpRef.current && channelRef.current) {
                      await channel.track({
                        user: {
                          id: currentUserId,
                          display_name: userData.display_name,
                          email: userData.email,
                          avatar_url: userData.avatar_url,
                        },
                        online_at: new Date().toISOString(),
                        taskId,
                      });
                    }
                  }, 1000);
                }

                // Reset retry count on success
                retryCountRef.current = 0;
                break;
              }
              case 'CHANNEL_ERROR':
              case 'TIMED_OUT': {
                if (DEV_MODE) {
                  console.error(`❌ Board ${boardId} channel error:`, status);
                }
                if (
                  retryCountRef.current < MAX_RETRIES &&
                  !isCleanedUpRef.current
                ) {
                  retryCountRef.current++;
                  if (DEV_MODE) {
                    console.log(
                      `Retrying board ${boardId} presence setup (${retryCountRef.current}/${MAX_RETRIES})...`
                    );
                  }
                  setTimeout(() => {
                    setupTaskViewer(boardId, taskId);
                  }, 2000 * retryCountRef.current);
                }
                break;
              }
              case 'CLOSED':
                if (DEV_MODE) {
                  console.info(`📡 Board ${boardId} channel closed`);
                }
                break;
              default:
                break;
            }
          });
      } catch (error) {
        if (DEV_MODE) {
          console.error(`Error setting up board ${boardId} presence:`, error);
        }

        if (retryCountRef.current < MAX_RETRIES && !isCleanedUpRef.current) {
          retryCountRef.current++;
          setTimeout(() => {
            setupTaskViewer(boardId, taskId);
          }, 2000 * retryCountRef.current);
        }
      }
    },
    [currentUserId]
  );

  // Function to start tracking a task/board
  const viewTask = useCallback(
    (taskId: string, boardId: string) => {
      setupTaskViewer(boardId, taskId);
    },
    [setupTaskViewer]
  );

  const unviewTask = () => {
    if (channelRef.current) {
      channelRef.current.track({
        user: {},
        online_at: new Date().toISOString(),
        taskId: null, // Untrack this task
      });
    }
  };

  // Function to get viewers for a task
  const getTaskViewers = useCallback(
    (taskId: string): RealtimePresenceState<UserPresenceState> => {
      return taskViewersMap.get(taskId) || {};
    },
    [taskViewersMap]
  );

  const value: TaskViewerContextValue = {
    viewTask,
    unviewTask,
    getTaskViewers,
    currentUserId,
    taskViewersMap,
  };

  return (
    <TaskViewerContext.Provider value={value}>
      {children}
    </TaskViewerContext.Provider>
  );
}

export function useTaskViewerContext() {
  const context = useContext(TaskViewerContext);

  if (!context) {
    throw new Error(
      'useTaskViewerContext must be used within a TaskViewerProvider'
    );
  }

  return context;
}
