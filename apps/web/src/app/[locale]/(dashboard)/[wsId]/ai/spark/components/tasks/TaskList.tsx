'use client';

import { Priority, Task, TaskStatus } from '../../types';
import { Badge } from '@tutur3u/ui/badge';
import { Button } from '@tutur3u/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tutur3u/ui/card';
import { format, parseISO } from 'date-fns';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Target,
  Timer,
} from 'lucide-react';

interface TaskListProps {
  tasks: Task[];
  selectedDate: Date;
}

export function TaskList({ tasks, selectedDate }: TaskListProps) {
  const statusColors: Record<TaskStatus, string> = {
    'not-started': 'bg-secondary',
    'in-progress': 'bg-blue-500',
    completed: 'bg-green-500',
    blocked: 'bg-destructive',
  };

  const priorityIcons: Record<Priority, React.ReactNode> = {
    high: <AlertCircle className="h-4 w-4 text-destructive" />,
    medium: <Clock className="h-4 w-4 text-yellow-500" />,
    low: <Target className="h-4 w-4 text-green-500" />,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          Tasks for {format(selectedDate, 'MMMM d, yyyy')}
        </CardTitle>
        <CardDescription>
          {tasks.length} task{tasks.length !== 1 ? 's' : ''} scheduled
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {tasks.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No tasks scheduled for this date
          </div>
        ) : (
          tasks.map((task, index) => (
            <div
              key={`${task.title}-${index}`}
              className="flex items-start justify-between gap-4 rounded-md border bg-card/50 p-4"
            >
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <div className="mt-1">{priorityIcons[task.priority]}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{task.title}</span>
                      <Badge
                        variant={
                          task.priority === 'high'
                            ? 'destructive'
                            : task.priority === 'medium'
                              ? 'default'
                              : 'secondary'
                        }
                        className="text-xs"
                      >
                        {task.priority}
                      </Badge>
                      {task.status && (
                        <div
                          className={`h-2 w-2 rounded-full ${
                            statusColors[task.status]
                          }`}
                        />
                      )}
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground">
                        {task.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      {task.estimatedHours && (
                        <div className="flex items-center gap-1">
                          <Timer className="h-3 w-3" />
                          {task.estimatedHours} hours
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(parseISO(task.start_date), 'MMM d')} -{' '}
                        {format(parseISO(task.end_date), 'MMM d, yyyy')}
                      </div>
                    </div>
                    {task.resources && task.resources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {task.resources.map((resource, resourceIdx) => (
                          <Button
                            key={`resource-${index}-${resourceIdx}`}
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 text-xs"
                            asChild
                          >
                            <a
                              href={resource.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {resource.title}
                            </a>
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
