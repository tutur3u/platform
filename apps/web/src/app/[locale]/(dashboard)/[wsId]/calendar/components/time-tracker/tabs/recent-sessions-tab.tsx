'use client';

import { Filter, Play, Sparkles, Zap } from '@tuturuuu/icons';
import type { TimeTrackingCategory } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
} from '../../../../time-tracker/types';
import { SessionCard } from '../components/session-card';
import { getCategoryColor } from '../utils';

interface RecentSessionsTabProps {
  sessions: SessionWithRelations[];
  categories: TimeTrackingCategory[];
  tasks: ExtendedWorkspaceTask[];
  justCompletedId?: string;
  actionStates: Record<string, boolean>;
  onResume: (session: SessionWithRelations) => void;
  onDuplicate: (session: SessionWithRelations) => void;
  onDelete: (session: SessionWithRelations) => void;
  onSwitchToCurrentTab: () => void;
}

export function RecentSessionsTab({
  sessions,
  categories,
  tasks,
  justCompletedId,
  actionStates,
  onResume,
  onDuplicate,
  onDelete,
  onSwitchToCurrentTab,
}: RecentSessionsTabProps) {
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterTaskId, setFilterTaskId] = useState('');

  const filteredSessions = sessions.filter((session) => {
    if (filterCategoryId && session.category_id !== filterCategoryId)
      return false;
    if (filterTaskId && session.task_id !== filterTaskId) return false;
    return true;
  });

  return (
    <Card className="transition-all hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base @lg:text-lg">
            <Zap className="h-4 w-4 @lg:h-5 @lg:w-5" />
            Recent Sessions
          </CardTitle>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" />
                Filter
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div>
                  <Label className="font-medium text-sm">Category</Label>
                  <Select
                    value={filterCategoryId}
                    onValueChange={setFilterCategoryId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All categories</SelectItem>
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
                </div>
                <div>
                  <Label className="font-medium text-sm">Task</Label>
                  <Select value={filterTaskId} onValueChange={setFilterTaskId}>
                    <SelectTrigger>
                      <SelectValue placeholder="All tasks" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All tasks</SelectItem>
                      {tasks.map((task) => (
                        <SelectItem key={task.id} value={task.id || ''}>
                          {task.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent>
        {filteredSessions.length === 0 ? (
          <div className="py-8 text-center">
            <div className="relative mx-auto mb-3 h-16 w-16">
              <Zap className="h-16 w-16 text-muted-foreground/50" />
              {sessions.length === 0 && (
                <Sparkles className="-top-1 -right-1 absolute h-6 w-6 animate-pulse text-primary" />
              )}
            </div>
            <p className="text-muted-foreground text-sm @lg:text-base">
              {sessions.length === 0
                ? 'Ready to start tracking time?'
                : 'No sessions match your filters'}
            </p>
            <p className="mt-1 text-muted-foreground text-xs @lg:text-sm">
              {sessions.length === 0
                ? 'Start your first timer to see your productivity journey!'
                : 'Try adjusting your filters above'}
            </p>
            {sessions.length === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={onSwitchToCurrentTab}
                className="mt-4"
              >
                <Play className="mr-2 h-4 w-4" />
                Start First Timer
              </Button>
            )}
          </div>
        ) : (
          <div className="max-h-96 space-y-3 overflow-y-auto @lg:max-h-[500px]">
            {filteredSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                tasks={tasks}
                isHighlighted={justCompletedId === session.id}
                isResuming={actionStates[`resume-${session.id}`]}
                onResume={() => onResume(session)}
                onDuplicate={() => onDuplicate(session)}
                onDelete={() => onDelete(session)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
