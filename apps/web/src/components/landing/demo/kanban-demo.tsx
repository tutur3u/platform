'use client';

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  GripVertical,
  Loader2,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

type DemoColor = 'gray' | 'blue' | 'green' | 'purple' | 'orange' | 'yellow';
type DemoStatus = 'not_started' | 'active' | 'done';
type DemoPriority = 'high' | 'medium' | 'low';

interface DemoList {
  id: string;
  name: string;
  color: DemoColor;
  status: DemoStatus;
}

interface DemoLabel {
  name: string;
  color: DemoColor;
}

interface DemoAssignee {
  initials: string;
  color: DemoColor;
}

interface DemoTask {
  id: string;
  name: string;
  listId: string;
  priority?: DemoPriority;
  labels?: DemoLabel[];
  dueDate?: string;
  assignees?: DemoAssignee[];
  estimationPoints?: number;
  ticketId?: string;
}

// Column header gradient backgrounds
const columnHeaderGradients: Record<DemoColor, string> = {
  gray: 'from-dynamic-gray/10 to-transparent',
  blue: 'from-dynamic-blue/10 to-transparent',
  green: 'from-dynamic-green/10 to-transparent',
  purple: 'from-dynamic-purple/10 to-transparent',
  orange: 'from-dynamic-orange/10 to-transparent',
  yellow: 'from-dynamic-yellow/10 to-transparent',
};

// Status icons with better visual design
const statusIcons: Record<DemoStatus, React.ReactNode> = {
  not_started: <Circle className="h-3.5 w-3.5" />,
  active: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  done: <CheckCircle2 className="h-3.5 w-3.5" />,
};

// Status badge colors with better contrast
const statusBadgeColors: Record<DemoStatus, string> = {
  not_started:
    'bg-dynamic-gray/15 text-dynamic-gray border-dynamic-gray/20 shadow-dynamic-gray/5',
  active:
    'bg-dynamic-blue/15 text-dynamic-blue border-dynamic-blue/20 shadow-dynamic-blue/5',
  done: 'bg-dynamic-green/15 text-dynamic-green border-dynamic-green/20 shadow-dynamic-green/5',
};

const priorityConfig: Record<
  DemoPriority,
  { icon: React.ReactNode; color: string }
> = {
  high: {
    icon: <AlertCircle className="h-3 w-3" />,
    color:
      'text-dynamic-red border-dynamic-red/30 bg-dynamic-red/10 shadow-sm shadow-dynamic-red/10',
  },
  medium: {
    icon: <Calendar className="h-3 w-3" />,
    color:
      'text-dynamic-orange border-dynamic-orange/30 bg-dynamic-orange/10 shadow-sm shadow-dynamic-orange/10',
  },
  low: {
    icon: null,
    color:
      'text-dynamic-blue border-dynamic-blue/30 bg-dynamic-blue/10 shadow-sm shadow-dynamic-blue/10',
  },
};

const labelColorClasses: Record<DemoColor, string> = {
  gray: 'bg-dynamic-gray/15 text-dynamic-gray border-dynamic-gray/25',
  blue: 'bg-dynamic-blue/15 text-dynamic-blue border-dynamic-blue/25',
  green: 'bg-dynamic-green/15 text-dynamic-green border-dynamic-green/25',
  purple: 'bg-dynamic-purple/15 text-dynamic-purple border-dynamic-purple/25',
  orange: 'bg-dynamic-orange/15 text-dynamic-orange border-dynamic-orange/25',
  yellow: 'bg-dynamic-yellow/15 text-dynamic-yellow border-dynamic-yellow/25',
};

// Avatar colors - using solid backgrounds to prevent overlap issues
const avatarColorClasses: Record<DemoColor, string> = {
  gray: 'bg-dynamic-gray text-white',
  blue: 'bg-dynamic-blue text-white',
  green: 'bg-dynamic-green text-white',
  purple: 'bg-dynamic-purple text-white',
  orange: 'bg-dynamic-orange text-white',
  yellow: 'bg-dynamic-yellow text-foreground',
};

// Card border accent colors
const cardAccentColors: Record<DemoColor, string> = {
  gray: 'border-l-dynamic-gray',
  blue: 'border-l-dynamic-blue',
  green: 'border-l-dynamic-green',
  purple: 'border-l-dynamic-purple',
  orange: 'border-l-dynamic-orange',
  yellow: 'border-l-dynamic-yellow',
};

function DemoTaskCard({ task, list }: { task: DemoTask; list: DemoList }) {
  const priority = task.priority ? priorityConfig[task.priority] : null;

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/40 border-l-[3px] bg-background/80 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border/60 hover:shadow-md',
        cardAccentColors[list.color]
      )}
    >
      <div className="p-3">
        {/* Header with drag handle and task name */}
        <div className="flex items-start gap-2">
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/50" />
          <div className="min-w-0 flex-1">
            {/* Ticket ID */}
            {task.ticketId && (
              <Badge
                variant="outline"
                className={cn(
                  'mb-1.5 px-1.5 py-0 font-mono text-[9px] tracking-wide',
                  labelColorClasses[list.color]
                )}
              >
                {task.ticketId}
              </Badge>
            )}
            {/* Task name */}
            <div className="font-medium text-foreground/90 text-xs leading-snug">
              {task.name}
            </div>
          </div>
          {/* Assignees */}
          {task.assignees && task.assignees.length > 0 && (
            <div className="flex -space-x-1">
              {task.assignees.slice(0, 2).map((assignee, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full border-2 border-background font-semibold text-[9px] shadow-sm transition-transform hover:z-10 hover:scale-110',
                    avatarColorClasses[assignee.color]
                  )}
                >
                  {assignee.initials}
                </div>
              ))}
              {task.assignees.length > 2 && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted font-semibold text-[9px] text-muted-foreground shadow-sm">
                  +{task.assignees.length - 2}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Metadata row */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {/* Priority */}
          {priority && (
            <Badge
              variant="outline"
              className={cn('h-5 gap-1 px-1.5 text-[9px]', priority.color)}
            >
              {priority.icon}
            </Badge>
          )}

          {/* Labels */}
          {task.labels?.map((label, idx) => (
            <Badge
              key={idx}
              variant="outline"
              className={cn(
                'h-5 px-1.5 font-medium text-[9px]',
                labelColorClasses[label.color]
              )}
            >
              {label.name}
            </Badge>
          ))}

          {/* Estimation points */}
          {task.estimationPoints !== undefined && (
            <Badge
              variant="outline"
              className="h-5 border-dynamic-cyan/25 bg-dynamic-cyan/10 px-1.5 font-mono text-[9px] text-dynamic-cyan shadow-dynamic-cyan/10 shadow-sm"
            >
              {task.estimationPoints}pt
            </Badge>
          )}

          {/* Due date */}
          {task.dueDate && (
            <div className="ml-auto flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5 text-[9px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {task.dueDate}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DemoColumn({ list, tasks }: { list: DemoList; tasks: DemoTask[] }) {
  const statusIcon = statusIcons[list.status];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border/20 bg-muted/20 transition-all">
      {/* Column header with gradient */}
      <div
        className={cn(
          'flex items-center justify-between border-border/20 border-b bg-gradient-to-b p-2.5',
          columnHeaderGradients[list.color]
        )}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-lg border shadow-sm',
              statusBadgeColors[list.status]
            )}
          >
            {statusIcon}
          </div>
          <span className="font-semibold text-sm tracking-tight">
            {list.name}
          </span>
        </div>
        <Badge
          variant="secondary"
          className={cn(
            'min-w-6 justify-center rounded-full px-2 font-semibold text-xs shadow-sm',
            statusBadgeColors[list.status]
          )}
        >
          {tasks.length}
        </Badge>
      </div>

      {/* Tasks list */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
        {tasks.map((task) => (
          <DemoTaskCard key={task.id} task={task} list={list} />
        ))}
      </div>
    </div>
  );
}

export function KanbanDemo() {
  const t = useTranslations('landing.demo.kanban');

  const lists: DemoList[] = [
    {
      id: 'todo',
      name: t('columns.todo'),
      color: 'gray',
      status: 'not_started',
    },
    {
      id: 'in-progress',
      name: t('columns.inProgress'),
      color: 'blue',
      status: 'active',
    },
    { id: 'done', name: t('columns.done'), color: 'green', status: 'done' },
  ];

  const tasks: DemoTask[] = [
    // Todo column
    {
      id: '1',
      name: t('tasks.task1.name'),
      listId: 'todo',
      ticketId: 'TU-101',
      priority: 'high',
      labels: [{ name: t('tasks.task1.label'), color: 'purple' }],
      dueDate: t('tasks.task1.dueDate'),
      assignees: [
        { initials: 'JD', color: 'blue' },
        { initials: 'KL', color: 'green' },
      ],
    },
    {
      id: '2',
      name: t('tasks.task2.name'),
      listId: 'todo',
      ticketId: 'TU-102',
      priority: 'medium',
      labels: [{ name: t('tasks.task2.label'), color: 'orange' }],
      estimationPoints: 3,
    },
    // In Progress column
    {
      id: '3',
      name: t('tasks.task3.name'),
      listId: 'in-progress',
      ticketId: 'TU-98',
      priority: 'high',
      labels: [{ name: t('tasks.task3.label'), color: 'blue' }],
      dueDate: t('tasks.task3.dueDate'),
      assignees: [{ initials: 'MR', color: 'purple' }],
      estimationPoints: 5,
    },
    {
      id: '4',
      name: t('tasks.task4.name'),
      listId: 'in-progress',
      ticketId: 'TU-99',
      labels: [{ name: t('tasks.task4.label'), color: 'green' }],
      assignees: [{ initials: 'AS', color: 'orange' }],
    },
    // Done column
    {
      id: '5',
      name: t('tasks.task5.name'),
      listId: 'done',
      ticketId: 'TU-95',
      labels: [{ name: t('tasks.task5.label'), color: 'blue' }],
      assignees: [{ initials: 'JD', color: 'blue' }],
      estimationPoints: 2,
    },
    {
      id: '6',
      name: t('tasks.task6.name'),
      listId: 'done',
      ticketId: 'TU-96',
      labels: [{ name: t('tasks.task6.label'), color: 'purple' }],
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border/30 bg-background/80 shadow-sm backdrop-blur-sm">
      {/* Mobile: Horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto p-2 sm:hidden">
        {lists.map((list) => (
          <div key={list.id} className="w-[280px] shrink-0">
            <DemoColumn
              list={list}
              tasks={tasks.filter((task) => task.listId === list.id)}
            />
          </div>
        ))}
      </div>
      {/* Desktop: Grid layout */}
      <div className="hidden gap-2.5 p-2.5 sm:grid sm:grid-cols-3">
        {lists.map((list) => (
          <DemoColumn
            key={list.id}
            list={list}
            tasks={tasks.filter((task) => task.listId === list.id)}
          />
        ))}
      </div>
    </div>
  );
}
