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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Clock,
  Edit,
  Filter,
  Plus,
  Search,
  Target,
  Trash2,
  TrendingUp,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Progress } from '@tuturuuu/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useParams } from 'next/navigation';
import { useState } from 'react';

export default function TimeTrackerGoalsPage() {
  const params = useParams();
  const wsId = params.wsId as string;
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch real goals data
  const { data: goalsData, isLoading } = useQuery({
    queryKey: ['time-tracking-goals', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/goals`
      );
      if (!response.ok) throw new Error('Failed to fetch goals');
      return response.json();
    },
    refetchInterval: 300000, // 5 minutes
  });

  // Filter goals based on search
  const filteredGoals =
    goalsData?.goals?.filter(
      (goal: any) =>
        goal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        goal.description?.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  // Calculate real statistics
  const totalGoals = goalsData?.totalGoals || 0;
  const inProgressGoals = goalsData?.inProgressGoals || 0;
  const completedGoals = goalsData?.completedGoals || 0;
  const successRate =
    totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

  // Separate active and completed goals
  const activeGoals = filteredGoals.filter(
    (goal: any) => goal.status !== 'completed'
  );
  const completedGoalsList = filteredGoals.filter(
    (goal: any) => goal.status === 'completed'
  );

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="mb-6 flex items-center gap-2">
        <Target className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Time Tracker Goals</h1>
      </div>

      {/* Search and Actions Bar */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
          <Input
            placeholder="Search goals..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="flex items-center gap-2">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Goal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Goal</DialogTitle>
              <DialogDescription>
                Set a new time tracking goal to improve your productivity.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="goal-title">Goal Title</Label>
                <Input
                  id="goal-title"
                  placeholder="e.g., Complete Project X, Learn New Technology"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-description">Description</Label>
                <Input
                  id="goal-description"
                  placeholder="Detailed description of your goal"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="goal-target">Target Hours</Label>
                  <Input id="goal-target" type="number" placeholder="100" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal-deadline">Deadline</Label>
                  <Input id="goal-deadline" type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-category">Category</Label>
                <Select defaultValue="development">
                  <SelectTrigger id="goal-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="development">Development</SelectItem>
                    <SelectItem value="design">Design</SelectItem>
                    <SelectItem value="research">Research</SelectItem>
                    <SelectItem value="learning">Learning</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-priority">Priority</Label>
                <Select defaultValue="medium">
                  <SelectTrigger id="goal-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline">Cancel</Button>
              <Button>Create Goal</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Goals Overview */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Goals</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalGoals}</div>
            <p className="text-xs text-muted-foreground">+1 new this week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgressGoals}</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedGoals}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground">+5% from last month</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Goals */}
      <Card>
        <CardHeader>
          <CardTitle>Active Goals</CardTitle>
          <CardDescription>
            Goals you're currently working towards
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">Loading goals...</div>
            </div>
          ) : activeGoals.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">
                No active goals available
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {activeGoals.map((goal: any) => {
                const progress =
                  goal.targetHours > 0
                    ? Math.round((goal.completedHours / goal.targetHours) * 100)
                    : 0;
                const remainingHours = goal.targetHours - goal.completedHours;

                return (
                  <div key={goal.id} className="rounded-lg border p-4">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-3 w-3 rounded-full ${
                            goal.priority === 'high'
                              ? 'bg-red-500'
                              : goal.priority === 'medium'
                                ? 'bg-yellow-500'
                                : goal.priority === 'low'
                                  ? 'bg-green-500'
                                  : 'bg-blue-500'
                          }`}
                        ></div>
                        <div>
                          <h3 className="text-lg font-medium">{goal.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {goal.description || 'No description'}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">
                        {goal.priority} Priority
                      </Badge>
                    </div>

                    <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="rounded-lg bg-blue-50 p-3 text-center">
                        <div className="text-sm text-muted-foreground">
                          Target Hours
                        </div>
                        <div className="text-xl font-bold text-blue-600">
                          {goal.targetHours}h
                        </div>
                      </div>
                      <div className="rounded-lg bg-green-50 p-3 text-center">
                        <div className="text-sm text-muted-foreground">
                          Completed
                        </div>
                        <div className="text-xl font-bold text-green-600">
                          {goal.completedHours}h
                        </div>
                      </div>
                      <div className="rounded-lg bg-orange-50 p-3 text-center">
                        <div className="text-sm text-muted-foreground">
                          Remaining
                        </div>
                        <div className="text-xl font-bold text-orange-600">
                          {remainingHours}h
                        </div>
                      </div>
                    </div>

                    <div className="mb-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>
                        Deadline:{' '}
                        {goal.deadline
                          ? new Date(goal.deadline).toLocaleDateString()
                          : 'No deadline'}
                      </span>
                      <span>Category: {goal.category?.name || 'General'}</span>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" size="sm">
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Completed Goals */}
      <Card>
        <CardHeader>
          <CardTitle>Completed Goals</CardTitle>
          <CardDescription>Goals you've successfully achieved</CardDescription>
        </CardHeader>
        <CardContent>
          {completedGoalsList.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">
                No completed goals yet
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {completedGoalsList.map((goal: any) => (
                <div
                  key={goal.id}
                  className="flex items-center justify-between rounded-lg border bg-green-50 p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-3 w-3 rounded-full bg-green-500"></div>
                    <div>
                      <h3 className="font-medium">{goal.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {goal.description || 'No description'}
                      </p>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Completed: {goal.completedHours}h / Target:{' '}
                        {goal.targetHours}h • Finished on{' '}
                        {goal.completedAt
                          ? new Date(goal.completedAt).toLocaleDateString()
                          : 'Unknown date'}
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-800"
                  >
                    Completed
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Goal Analytics */}
      <Card>
        <CardHeader>
          <CardTitle>Goal Analytics</CardTitle>
          <CardDescription>Track your progress and performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <h4 className="font-medium">Monthly Goal Completion</h4>
              <div className="flex h-48 items-center justify-center text-muted-foreground">
                Chart placeholder - Monthly goal completion trends
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-medium">Category Performance</h4>
              <div className="flex h-48 items-center justify-center text-muted-foreground">
                Chart placeholder - Goal performance by category
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common actions for managing your goals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Plus className="h-6 w-6" />
              <span>Add Goal</span>
            </Button>
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Target className="h-6 w-6" />
              <span>View Progress</span>
            </Button>
            <Button
              variant="outline"
              className="flex h-20 flex-col items-center justify-center gap-2"
            >
              <Clock className="h-6 w-6" />
              <span>Start Timer</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
