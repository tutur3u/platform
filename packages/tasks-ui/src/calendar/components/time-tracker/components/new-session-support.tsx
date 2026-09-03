'use client';

import {
  CheckCircle,
  Copy,
  ExternalLink,
  MapPin,
  RotateCcw,
  Sparkles,
  Tag,
} from '@tuturuuu/icons';
import type { TimeTrackingCategory } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
} from '@tuturuuu/ui/time-tracker/types';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { formatDuration, getCategoryColor } from '../utils';

export interface SessionTemplate {
  title: string;
  description?: string;
  category_id?: string;
  task_id?: string;
  usage_count: number;
}

export function CategorySelect({
  categories,
  value,
  onChange,
}: {
  categories: TimeTrackingCategory[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="@lg:text-base text-sm">
        <SelectValue placeholder="Category (optional)" />
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
  );
}

export function TaskSuggestionCard({
  title,
  onCreateTask,
}: {
  title: string;
  onCreateTask: () => void;
}) {
  return (
    <div className="rounded-lg border border-dynamic-blue/30 bg-linear-to-r from-dynamic-blue/10 to-dynamic-blue/5 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="rounded-full bg-dynamic-blue/20 p-1">
            <Sparkles className="h-3 w-3 text-dynamic-blue" />
          </div>
          <div className="flex-1">
            <span className="font-medium text-dynamic-blue text-sm">
              Convert to task?
            </span>
            <p className="mt-0.5 text-muted-foreground text-xs">
              Create "{title}" as a new task for better organization and
              tracking.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onCreateTask}
          className="h-8 border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue text-xs hover:bg-dynamic-blue/20"
        >
          Create Task
        </Button>
      </div>
    </div>
  );
}

export function LinkedTaskCard({
  task,
  onUnlink,
}: {
  task?: ExtendedWorkspaceTask;
  onUnlink: () => void;
}) {
  if (!task) return null;
  return (
    <div className="rounded-lg border border-dynamic-green/30 bg-linear-to-r from-dynamic-green/5 to-dynamic-green/3 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-dynamic-green/30 bg-linear-to-br from-dynamic-green/20 to-dynamic-green/10">
          <CheckCircle className="h-5 w-5 text-dynamic-green" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-dynamic-green text-sm">
              Task Linked Successfully
            </span>
            <div className="flex items-center">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                <a href={`/tasks/${task.id}`}>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onUnlink}
                className="h-7 px-2 text-muted-foreground text-xs hover:text-foreground"
              >
                Unlink
              </Button>
            </div>
          </div>
          <p className="font-medium text-foreground text-sm">{task.name}</p>
          {task.description && (
            <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
              {task.description}
            </p>
          )}
          {task.board_name && task.list_name && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium text-xs">{task.board_name}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-md border border-dynamic-green/20 bg-linear-to-r from-dynamic-green/10 to-dynamic-green/5 px-2 py-1">
                <Tag className="h-3 w-3 text-dynamic-green" />
                <span className="font-medium text-dynamic-green text-xs">
                  {task.list_name}
                </span>
              </div>
            </div>
          )}
          <p className="mt-2 text-muted-foreground text-xs">
            Time will be automatically tracked for this task
          </p>
        </div>
      </div>
    </div>
  );
}

export function QuickActions({
  recentSessions,
  templates,
  onDuplicate,
  onTemplate,
}: {
  recentSessions: SessionWithRelations[];
  templates: SessionTemplate[];
  onDuplicate: (session: SessionWithRelations) => void;
  onTemplate: (template: SessionTemplate) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground text-xs">Quick Start:</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowMore(!showMore)}
          className="h-6 px-2 text-xs"
        >
          {showMore ? 'Less' : 'More'}
        </Button>
      </div>
      <div className="space-y-2">
        {recentSessions[0] && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDuplicate(recentSessions[0]!)}
            className="w-full justify-start text-xs"
          >
            <RotateCcw className="mr-2 h-3 w-3" />
            Repeat: {recentSessions[0].title}
          </Button>
        )}
        {showMore &&
          templates.slice(0, 3).map((template) => (
            <Button
              key={`template-${template.title}`}
              variant="outline"
              size="sm"
              onClick={() => onTemplate(template)}
              className="w-full justify-start text-xs"
            >
              <Copy className="mr-2 h-3 w-3" />
              {template.title}
              <Badge variant="secondary" className="ml-auto text-xs">
                {template.usage_count}×
              </Badge>
            </Button>
          ))}
      </div>
    </div>
  );
}

export function CompletionCelebration({
  session,
}: {
  session: SessionWithRelations;
}) {
  return (
    <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/20 backdrop-blur-sm duration-300">
      <div className="zoom-in animate-in rounded-lg border bg-background p-6 shadow-xl duration-300">
        <div className="text-center">
          <CheckCircle className="mx-auto mb-4 h-12 w-12 animate-pulse text-green-500" />
          <h3 className="mb-2 font-semibold text-lg">Session Completed!</h3>
          <p className="mb-1 text-muted-foreground">{session.title}</p>
          <p className="font-medium text-green-600 text-sm dark:text-green-400">
            {formatDuration(session.duration_seconds || 0)} tracked
          </p>
        </div>
      </div>
    </div>
  );
}
