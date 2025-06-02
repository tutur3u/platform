'use client';

import { CategoryManager } from './components/category-manager';
import { GoalManager } from './components/goal-manager';
import { SessionHistory } from './components/session-history';
import { TimerControls } from './components/timer-controls';
import type {
  TimeTrackingCategory,
  TimeTrackingSession,
  WorkspaceTask,
} from '@tuturuuu/types/db';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Calendar,
  Clock,
  Settings,
  Timer,
  TrendingUp,
  Zap,
} from '@tuturuuu/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useCallback, useEffect, useState } from 'react';

interface TimeTrackerContentProps {
  wsId: string;
}

interface TimerStats {
  todayTime: number;
  weekTime: number;
  monthTime: number;
  streak: number;
  categoryBreakdown?: {
    today: Record<string, number>;
    week: Record<string, number>;
    month: Record<string, number>;
  };
}

interface SessionWithRelations extends TimeTrackingSession {
  category?: TimeTrackingCategory;
  task?: WorkspaceTask;
}

interface TimeTrackingGoal {
  id: string;
  ws_id: string;
  user_id: string;
  category_id?: string;
  daily_goal_minutes: number;
  weekly_goal_minutes?: number;
  is_active: boolean;
  category?: TimeTrackingCategory;
}

export default function TimeTrackerContent({ wsId }: TimeTrackerContentProps) {
  const [activeTab, setActiveTab] = useState('timer');
  const [currentSession, setCurrentSession] =
    useState<SessionWithRelations | null>(null);
  const [categories, setCategories] = useState<TimeTrackingCategory[]>([]);
  const [goals, setGoals] = useState<TimeTrackingGoal[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionWithRelations[]>(
    []
  );
  const [timerStats, setTimerStats] = useState<TimerStats>({
    todayTime: 0,
    weekTime: 0,
    monthTime: 0,
    streak: 0,
  });

  // Timer state
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [tasks, setTasks] = useState<Partial<WorkspaceTask>[]>([]);

  // API call helper
  const apiCall = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return response.json();
    },
    []
  );

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      const [
        categoriesRes,
        runningRes,
        recentRes,
        statsRes,
        goalsRes,
        tasksRes,
      ] = await Promise.all([
        apiCall(`/api/v1/workspaces/${wsId}/time-tracking/categories`),
        apiCall(
          `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
        ),
        apiCall(
          `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=recent&limit=50`
        ),
        apiCall(`/api/v1/workspaces/${wsId}/time-tracking/sessions?type=stats`),
        apiCall(`/api/v1/workspaces/${wsId}/time-tracking/goals`),
        apiCall(`/api/v1/workspaces/${wsId}/tasks?limit=100`),
      ]);

      setCategories(categoriesRes.categories || []);
      setRecentSessions(recentRes.sessions || []);
      setTimerStats(
        statsRes.stats || { todayTime: 0, weekTime: 0, monthTime: 0, streak: 0 }
      );
      setGoals(goalsRes.goals || []);
      setTasks(tasksRes.tasks || []);

      if (runningRes.session) {
        setCurrentSession(runningRes.session);
        setIsRunning(true);
        const elapsed = Math.floor(
          (new Date().getTime() -
            new Date(runningRes.session.start_time).getTime()) /
            1000
        );
        setElapsedTime(elapsed);
      } else {
        setCurrentSession(null);
        setIsRunning(false);
        setElapsedTime(0);
      }
    } catch (error) {
      console.error('Error fetching time tracking data:', error);
    }
  }, [wsId, apiCall]);

  // Timer effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (isRunning && currentSession) {
      interval = setInterval(() => {
        const elapsed = Math.floor(
          (new Date().getTime() -
            new Date(currentSession.start_time).getTime()) /
            1000
        );
        setElapsedTime(elapsed);
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRunning, currentSession]);

  // Load data on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Format time display
  const formatTime = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Format duration for display
  const formatDuration = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, []);

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="group cursor-pointer transition-all hover:scale-105 hover:shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 text-blue-500 transition-transform group-hover:scale-110" />
              <div>
                <p className="text-muted-foreground text-sm">Today</p>
                <p className="text-2xl font-bold">
                  {formatDuration(timerStats.todayTime)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group cursor-pointer transition-all hover:scale-105 hover:shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-green-500 transition-transform group-hover:scale-110" />
              <div>
                <p className="text-muted-foreground text-sm">This Week</p>
                <p className="text-2xl font-bold">
                  {formatDuration(timerStats.weekTime)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group cursor-pointer transition-all hover:scale-105 hover:shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Zap className="h-8 w-8 text-purple-500 transition-transform group-hover:scale-110" />
              <div>
                <p className="text-muted-foreground text-sm">This Month</p>
                <p className="text-2xl font-bold">
                  {formatDuration(timerStats.monthTime)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="group cursor-pointer transition-all hover:scale-105 hover:shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-orange-500 transition-transform group-hover:scale-110" />
              <div>
                <p className="text-muted-foreground text-sm">Streak</p>
                <p className="text-2xl font-bold">{timerStats.streak} days</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="timer" className="flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Timer
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            History
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Categories
          </TabsTrigger>
          <TabsTrigger value="goals" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Goals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timer" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TimerControls
                wsId={wsId}
                currentSession={currentSession}
                setCurrentSession={setCurrentSession}
                elapsedTime={elapsedTime}
                setElapsedTime={setElapsedTime}
                isRunning={isRunning}
                setIsRunning={setIsRunning}
                categories={categories}
                tasks={tasks}
                onSessionUpdate={fetchData}
                formatTime={formatTime}
                formatDuration={formatDuration}
                apiCall={apiCall}
              />
            </div>
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Sessions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[400px] space-y-3 overflow-y-auto">
                    {recentSessions.slice(0, 5).map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {session.title}
                          </p>
                          <div className="text-muted-foreground flex items-center gap-2 text-sm">
                            {session.category && (
                              <span>{session.category.name}</span>
                            )}
                            <span>•</span>
                            <span>
                              {new Date(
                                session.start_time
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            {session.duration_seconds
                              ? formatDuration(session.duration_seconds)
                              : '-'}
                          </p>
                        </div>
                      </div>
                    ))}
                    {recentSessions.length === 0 && (
                      <p className="text-muted-foreground py-8 text-center">
                        No sessions yet. Start your first timer!
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <SessionHistory
            wsId={wsId}
            sessions={recentSessions}
            categories={categories}
            tasks={tasks}
            onSessionUpdate={fetchData}
            formatDuration={formatDuration}
            apiCall={apiCall}
          />
        </TabsContent>

        <TabsContent value="categories">
          <CategoryManager
            wsId={wsId}
            categories={categories}
            onCategoriesUpdate={fetchData}
            apiCall={apiCall}
          />
        </TabsContent>

        <TabsContent value="goals">
          <GoalManager
            wsId={wsId}
            goals={goals}
            categories={categories}
            timerStats={timerStats}
            onGoalsUpdate={fetchData}
            formatDuration={formatDuration}
            apiCall={apiCall}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
