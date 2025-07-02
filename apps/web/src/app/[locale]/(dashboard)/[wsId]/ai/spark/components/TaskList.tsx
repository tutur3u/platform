'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { CalendarDays } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';

interface Task {
  title: string;
  description: string;
  priority: string;
  milestone: string;
  timeline: string;
}

interface TaskListProps {
  tasks: Task[];
  selectedDate: Date;
}

export function TaskList({ tasks, selectedDate }: TaskListProps) {
  const priorityGroups = ['high', 'medium', 'low'].map((priority) => ({
    priority,
    tasks: tasks.filter((task) => task.priority === priority),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {selectedDate.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          })}
        </CardTitle>
        <CardDescription>
          {tasks.length} tasks planned for this month
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <CalendarDays className="h-12 w-12 text-muted-foreground" />
            <p className="text-center text-muted-foreground">
              No tasks planned for this month
            </p>
            <p className="text-center text-sm text-muted-foreground">
              Select a different month to view tasks
            </p>
          </div>
        ) : (
          <Accordion type="multiple" className="space-y-4">
            {priorityGroups.map(
              ({ priority, tasks }) =>
                tasks.length > 0 && (
                  <AccordionItem
                    key={priority}
                    value={priority}
                    className="border-none data-[state=open]:bg-muted/50"
                  >
                    <AccordionTrigger className="rounded-lg border px-4 py-2 hover:bg-muted/50 hover:no-underline data-[state=open]:rounded-b-none data-[state=open]:border-b-0">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'h-2 w-2 rounded-full',
                            priority === 'high'
                              ? 'bg-destructive'
                              : priority === 'medium'
                                ? 'bg-primary'
                                : 'bg-secondary'
                          )}
                        />
                        <h4 className="font-medium capitalize">
                          {priority} Priority
                        </h4>
                        <Badge variant="secondary" className="ml-2">
                          {tasks.length}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="rounded-b-lg border border-t-0 px-4 pt-2 pb-4">
                      <div className="grid gap-2">
                        {tasks.map((task, idx) => (
                          <div
                            key={idx}
                            className="group relative rounded-lg border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-sm"
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                  <h5 className="leading-none font-medium">
                                    {task.title}
                                  </h5>
                                  <p className="text-sm text-muted-foreground">
                                    {task.description}
                                  </p>
                                  <div className="flex items-center gap-2 pt-2">
                                    <Badge variant="secondary">
                                      {task.milestone}
                                    </Badge>
                                    <Badge variant="outline">
                                      {task.timeline}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
            )}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
