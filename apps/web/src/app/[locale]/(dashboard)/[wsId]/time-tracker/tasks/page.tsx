'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { CircleCheck, Clock, Filter, Plus, Search } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { useParams } from 'next/navigation';
import { useState } from 'react';

// Helper function to format duration
const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

export default function TimeTrackerTasksPage() {
  const params = useParams();
  const wsId = params.wsId as string;
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch real tasks data
  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['time-tracking-tasks', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/tasks`
      );
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    refetchInterval: 300000, // 5 minutes
  });

  // Fetch task statistics
  const { data: statsData } = useQuery({
    queryKey: ['time-tracking-task-stats', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/tasks?type=stats`
      );
      if (!response.ok) throw new Error('Failed to fetch task stats');
      return response.json();
    },
  });

  // Filter tasks based on search
  const filteredTasks =
    tasksData?.tasks?.filter(
      (task: any) =>
        task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  // Calculate real statistics
  const totalTasks = statsData?.totalTasks || 0;
  const inProgressTasks = statsData?.inProgressTasks || 0;
  const completedTasks = statsData?.completedTasks || 0;
  const overdueTasks = statsData?.overdueTasks || 0;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="mb-6 flex items-center gap-2">
        <CircleCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Time Tracker Tasks</h1>
      </div>

      {/* Search and Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
        <Button className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          New Task
        </Button>
      </div>

      {/* Task Statistics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <CircleCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTasks}</div>
            <p className="text-xs text-muted-foreground">+3 new this week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgressTasks}</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CircleCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedTasks}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <Clock className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {overdueTasks}
            </div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Task List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Tasks</CardTitle>
          <CardDescription>
            Tasks that need time tracking attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">Loading tasks...</div>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">
                {searchQuery
                  ? 'No tasks match your search'
                  : 'No tasks available'}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTasks.slice(0, 10).map((task: any) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        task.priority === 'high'
                          ? 'bg-red-500'
                          : task.priority === 'medium'
                            ? 'bg-yellow-500'
                            : task.priority === 'low'
                              ? 'bg-green-500'
                              : 'bg-blue-500'
                      }`}
                    ></div>
                    <div>
                      <h3 className="font-medium">{task.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {task.description || 'No description'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="secondary">
                      {task.category?.name || 'General'}
                    </Badge>
                    <div className="text-sm text-muted-foreground">
                      {task.estimatedTime
                        ? formatDuration(task.estimatedTime)
                        : 'No estimate'}
                    </div>
                    <Button variant="outline" size="sm">
                      Start Timer
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common time tracking actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Clock className="h-6 w-6" />
              <span>Start Break Timer</span>
            </Button>
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <CircleCheck className="h-6 w-6" />
              <span>Mark Task Complete</span>
            </Button>
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Plus className="h-6 w-6" />
              <span>Create Time Entry</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
