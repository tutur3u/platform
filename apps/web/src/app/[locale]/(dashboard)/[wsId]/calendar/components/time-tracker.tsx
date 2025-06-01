'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  TimeTrackingCategory,
  TimeTrackingSession,
  WorkspaceTask,
} from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Calendar,
  Clock,
  Play,
  Square,
  Timer,
  TrendingUp,
  Zap,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface TimeTrackerProps {
  wsId: string;
  tasks?: Partial<WorkspaceTask>[];
}

interface TimerStats {
  todayTime: number;
  weekTime: number;
  monthTime: number;
  streak: number;
}

export default function TimeTracker({ wsId, tasks = [] }: TimeTrackerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSession, setCurrentSession] =
    useState<TimeTrackingSession | null>(null);
  const [categories, setCategories] = useState<TimeTrackingCategory[]>([]);
  const [recentSessions, setRecentSessions] = useState<TimeTrackingSession[]>(
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

  // Form state
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionDescription, setNewSessionDescription] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');

  const supabase = createClient();

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

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      // Fetch categories
      const { data: categoriesData } = await supabase
        .from('time_tracking_categories')
        .select('*')
        .eq('ws_id', wsId)
        .order('name');

      if (categoriesData) {
        setCategories(categoriesData);
      }

      // Fetch current running session
      const { data: runningSession } = await supabase
        .from('time_tracking_sessions')
        .select(
          `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
        )
        .eq('ws_id', wsId)
        .eq('is_running', true)
        .maybeSingle();

      if (runningSession) {
        setCurrentSession(runningSession);
        setIsRunning(true);
        const elapsed = Math.floor(
          (new Date().getTime() -
            new Date(runningSession.start_time).getTime()) /
            1000
        );
        setElapsedTime(elapsed);
      }

      // Fetch recent sessions (last 10)
      const { data: recentData } = await supabase
        .from('time_tracking_sessions')
        .select(
          `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
        )
        .eq('ws_id', wsId)
        .eq('is_running', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (recentData) {
        setRecentSessions(recentData);
      }

      // Calculate stats
      const today = new Date();
      const startOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );
      const startOfWeek = new Date(
        today.getTime() - today.getDay() * 24 * 60 * 60 * 1000
      );
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const { data: todayData } = await supabase
        .from('time_tracking_sessions')
        .select('duration_seconds')
        .eq('ws_id', wsId)
        .gte('start_time', startOfToday.toISOString())
        .not('duration_seconds', 'is', null);

      const { data: weekData } = await supabase
        .from('time_tracking_sessions')
        .select('duration_seconds')
        .eq('ws_id', wsId)
        .gte('start_time', startOfWeek.toISOString())
        .not('duration_seconds', 'is', null);

      const { data: monthData } = await supabase
        .from('time_tracking_sessions')
        .select('duration_seconds')
        .eq('ws_id', wsId)
        .gte('start_time', startOfMonth.toISOString())
        .not('duration_seconds', 'is', null);

      setTimerStats({
        todayTime:
          todayData?.reduce(
            (sum, session) => sum + (session.duration_seconds || 0),
            0
          ) || 0,
        weekTime:
          weekData?.reduce(
            (sum, session) => sum + (session.duration_seconds || 0),
            0
          ) || 0,
        monthTime:
          monthData?.reduce(
            (sum, session) => sum + (session.duration_seconds || 0),
            0
          ) || 0,
        streak: 0, // You can implement streak calculation based on your requirements
      });
    } catch (error) {
      console.error('Error fetching time tracking data:', error);
    }
  }, [wsId, supabase]);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;

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

  // Start timer
  const startTimer = async () => {
    if (!newSessionTitle.trim()) {
      toast.error('Please enter a title for your time session');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('time_tracking_sessions')
        .insert({
          ws_id: wsId,
          user_id: (await supabase.auth.getUser()).data.user?.id!,
          title: newSessionTitle,
          description: newSessionDescription || null,
          category_id: selectedCategoryId || null,
          task_id: selectedTaskId || null,
          start_time: new Date().toISOString(),
          is_running: true,
        })
        .select()
        .single();

      if (error) throw error;

      setCurrentSession(data);
      setIsRunning(true);
      setElapsedTime(0);
      setNewSessionTitle('');
      setNewSessionDescription('');
      setSelectedCategoryId('');
      setSelectedTaskId('');

      toast.success('Timer started!');
    } catch (error) {
      console.error('Error starting timer:', error);
      toast.error('Failed to start timer');
    }
  };

  // Stop timer
  const stopTimer = async () => {
    if (!currentSession) return;

    try {
      const endTime = new Date().toISOString();
      const { error } = await supabase
        .from('time_tracking_sessions')
        .update({
          end_time: endTime,
          is_running: false,
        })
        .eq('id', currentSession.id);

      if (error) throw error;

      setCurrentSession(null);
      setIsRunning(false);
      setElapsedTime(0);
      fetchData(); // Refresh data

      toast.success('Timer stopped and saved!');
    } catch (error) {
      console.error('Error stopping timer:', error);
      toast.error('Failed to stop timer');
    }
  };

  const getCategoryColor = (color: string) => {
    const colorMap: Record<string, string> = {
      RED: 'bg-red-500',
      BLUE: 'bg-blue-500',
      GREEN: 'bg-green-500',
      YELLOW: 'bg-yellow-500',
      ORANGE: 'bg-orange-500',
      PURPLE: 'bg-purple-500',
      PINK: 'bg-pink-500',
      INDIGO: 'bg-indigo-500',
      CYAN: 'bg-cyan-500',
      GRAY: 'bg-gray-500',
    };
    return colorMap[color] || 'bg-blue-500';
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant={isRunning ? 'default' : 'outline'}
          size="sm"
          className={cn(
            'gap-2 transition-all duration-200',
            isRunning && 'animate-pulse bg-red-500 text-white hover:bg-red-600'
          )}
        >
          {isRunning ? (
            <>
              <Square className="h-3 w-3" />
              {formatTime(elapsedTime)}
            </>
          ) : (
            <>
              <Timer className="h-3 w-3" />
              Time Tracker
            </>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Time Tracker
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Timer Section */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Current Session
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentSession ? (
                  <div className="space-y-4 text-center">
                    <div className="font-mono text-4xl font-bold text-red-500">
                      {formatTime(elapsedTime)}
                    </div>
                    <div>
                      <h3 className="font-medium">{currentSession.title}</h3>
                      {currentSession.description && (
                        <p className="text-sm text-muted-foreground">
                          {currentSession.description}
                        </p>
                      )}
                      {currentSession.category && (
                        <Badge
                          className={cn(
                            'mt-2',
                            getCategoryColor(
                              currentSession.category.color || 'BLUE'
                            )
                          )}
                        >
                          {currentSession.category.name}
                        </Badge>
                      )}
                    </div>
                    <Button
                      onClick={stopTimer}
                      variant="destructive"
                      className="w-full"
                    >
                      <Square className="mr-2 h-4 w-4" />
                      Stop Timer
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Input
                      placeholder="What are you working on?"
                      value={newSessionTitle}
                      onChange={(e) => setNewSessionTitle(e.target.value)}
                    />

                    <Textarea
                      placeholder="Add description (optional)"
                      value={newSessionDescription}
                      onChange={(e) => setNewSessionDescription(e.target.value)}
                      rows={3}
                    />

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Select
                        value={selectedCategoryId}
                        onValueChange={setSelectedCategoryId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              <div className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    'h-3 w-3 rounded-full',
                                    getCategoryColor(category.color || 'BLUE')
                                  )}
                                />
                                {category.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select
                        value={selectedTaskId}
                        onValueChange={setSelectedTaskId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Link to task (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {tasks.map((task) => (
                            <SelectItem key={task.id} value={task.id!}>
                              {task.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      onClick={startTimer}
                      className="w-full"
                      disabled={!newSessionTitle.trim()}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Start Timer
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-2">
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Today</p>
                      <p className="font-medium">
                        {formatDuration(timerStats.todayTime)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">This Week</p>
                      <p className="font-medium">
                        {formatDuration(timerStats.weekTime)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Recent Sessions */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Recent Sessions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentSessions.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No recent sessions found. Start your first timer!
                  </p>
                ) : (
                  <div className="max-h-96 space-y-3 overflow-y-auto">
                    {recentSessions.map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate font-medium">
                            {session.title}
                          </h4>
                          {session.description && (
                            <p className="truncate text-xs text-muted-foreground">
                              {session.description}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            {session.category && (
                              <Badge
                                variant="secondary"
                                className={cn(
                                  'text-xs',
                                  getCategoryColor(
                                    session.category.color || 'BLUE'
                                  )
                                )}
                              >
                                {session.category.name}
                              </Badge>
                            )}
                            {session.task && (
                              <Badge variant="outline" className="text-xs">
                                {session.task.name}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            {session.duration_seconds
                              ? formatDuration(session.duration_seconds)
                              : '-'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(session.start_time).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
