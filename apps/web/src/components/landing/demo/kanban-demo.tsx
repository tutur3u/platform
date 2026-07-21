'use client';

import {
  AlertCircle,
  ChevronUp,
  Clock,
  MousePointer2,
} from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import { motion, useReducedMotion } from 'framer-motion';
import { DemoLabel } from './demo-chrome';
import {
  type DemoList,
  type DemoTask,
  type TaskColor,
  useKanbanData,
} from './kanban-data';

const labelTones: Record<TaskColor, string> = {
  gray: 'border-foreground/12 bg-foreground/[0.04] text-foreground/50',
  blue: 'border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue',
  green: 'border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green',
  purple: 'border-dynamic-purple/25 bg-dynamic-purple/10 text-dynamic-purple',
  orange: 'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange',
};

const avatarTones: Record<TaskColor, string> = {
  gray: 'bg-foreground/15 text-foreground/70',
  blue: 'bg-dynamic-blue/20 text-dynamic-blue',
  green: 'bg-dynamic-green/20 text-dynamic-green',
  purple: 'bg-dynamic-purple/20 text-dynamic-purple',
  orange: 'bg-dynamic-orange/20 text-dynamic-orange',
};

const columnDots: Record<TaskColor, string> = {
  gray: 'bg-foreground/25',
  blue: 'bg-dynamic-blue',
  green: 'bg-dynamic-green',
  purple: 'bg-dynamic-purple',
  orange: 'bg-dynamic-orange',
};

const columnRails: Record<TaskColor, string> = {
  gray: 'via-foreground/15',
  blue: 'via-dynamic-blue/40',
  green: 'via-dynamic-green/40',
  purple: 'via-dynamic-purple/40',
  orange: 'via-dynamic-orange/40',
};

const priorityTones = {
  high: 'border-dynamic-red/25 bg-dynamic-red/10 text-dynamic-red',
  medium: 'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange',
  low: 'border-foreground/12 bg-foreground/[0.04] text-foreground/45',
} as const;

function TaskCard({ task, index }: { task: DemoTask; index: number }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="group/card relative overflow-hidden rounded-lg border border-foreground/[0.08] bg-background/60 p-2.5 transition-colors duration-300 hover:border-foreground/15 hover:bg-background/85"
      initial={{ opacity: 0, y: reduced ? 0 : 6 }}
      transition={{
        duration: reduced ? 0.15 : 0.4,
        delay: reduced ? 0 : 0.12 + index * 0.05,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <DemoLabel className="text-foreground/30">{task.ticketId}</DemoLabel>
        {task.assignees?.length ? (
          <div className="flex -space-x-1.5">
            {task.assignees.map((assignee) => (
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full border border-background font-mono-ui text-[0.55rem] tracking-tight',
                  avatarTones[assignee.color]
                )}
                key={assignee.initials}
              >
                {assignee.initials}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <p className="mt-2 font-medium text-[0.8rem] text-foreground/80 leading-snug">
        {task.name}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {task.priority ? (
          <span
            className={cn(
              'flex h-4.5 items-center gap-1 rounded-[5px] border px-1',
              priorityTones[task.priority]
            )}
          >
            {task.priority === 'high' ? (
              <AlertCircle className="h-2.5 w-2.5" />
            ) : (
              <ChevronUp
                className={cn(
                  'h-2.5 w-2.5',
                  task.priority === 'low' && 'rotate-180'
                )}
              />
            )}
          </span>
        ) : null}

        {task.labels?.map((label) => (
          <span
            className={cn(
              'flex h-4.5 items-center rounded-[5px] border px-1.5',
              labelTones[label.color]
            )}
            key={label.name}
          >
            <DemoLabel className="tracking-[0.1em]">{label.name}</DemoLabel>
          </span>
        ))}

        {task.estimationPoints === undefined ? null : (
          <span className="flex h-4.5 items-center rounded-[5px] border border-dynamic-cyan/25 bg-dynamic-cyan/10 px-1.5 font-mono-ui text-[0.6rem] text-dynamic-cyan tabular-nums">
            {task.estimationPoints}
          </span>
        )}

        {task.dueDate ? (
          <span className="ml-auto flex items-center gap-1 text-foreground/35">
            <Clock className="h-2.5 w-2.5" />
            <DemoLabel>{task.dueDate}</DemoLabel>
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}

function Column({
  list,
  tasks,
  offset,
}: {
  list: DemoList;
  tasks: DemoTask[];
  offset: number;
}) {
  return (
    <div className="flex h-full w-full flex-col rounded-xl border border-foreground/[0.06] bg-foreground/[0.015]">
      <div className="relative flex items-center gap-2 px-2.5 py-2">
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-2.5 bottom-0 h-px bg-gradient-to-r from-transparent to-transparent',
            columnRails[list.color]
          )}
        />
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            columnDots[list.color]
          )}
        />
        <DemoLabel className="truncate text-foreground/50">
          {list.name}
        </DemoLabel>
        <span className="ml-auto font-mono-ui text-[0.6rem] text-foreground/30 tabular-nums">
          {tasks.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-2">
        {tasks.map((task, index) => (
          <TaskCard index={offset + index} key={task.id} task={task} />
        ))}
        <div className="mt-auto h-6 rounded-lg border border-foreground/[0.06] border-dashed" />
      </div>
    </div>
  );
}

/**
 * A collaborator's pointer drifting across the board. Purely atmospheric: it
 * signals "someone else is in here" without pretending to be interactive.
 */
function GhostCursor() {
  const reduced = useReducedMotion();

  if (reduced) return null;

  return (
    <motion.div
      animate={{
        left: ['20%', '54%', '54%', '86%', '20%'],
        top: ['38%', '38%', '68%', '46%', '38%'],
        opacity: [0, 1, 1, 1, 0],
      }}
      aria-hidden
      className="pointer-events-none absolute z-20 hidden sm:block"
      initial={{ left: '20%', top: '38%', opacity: 0 }}
      transition={{
        duration: 14,
        times: [0, 0.25, 0.5, 0.75, 1],
        repeat: Number.POSITIVE_INFINITY,
        ease: 'easeInOut',
      }}
    >
      <MousePointer2 className="h-3.5 w-3.5 fill-dynamic-purple/70 text-dynamic-purple" />
      <span className="mt-0.5 ml-3 block h-1.5 w-6 rounded-full bg-dynamic-purple/30" />
    </motion.div>
  );
}

export function KanbanDemo() {
  const { lists, tasks } = useKanbanData();

  const columns = lists.map((list, listIndex) => ({
    list,
    tasks: tasks.filter((task) => task.listId === list.id),
    offset: listIndex * 2,
  }));

  return (
    <div className="relative">
      <GhostCursor />

      <div className="flex snap-x gap-2 overflow-x-auto p-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
        {columns.map((column) => (
          <div className="w-64 shrink-0 snap-start" key={column.list.id}>
            <Column {...column} />
          </div>
        ))}
      </div>

      <div className="hidden gap-2.5 p-2.5 sm:grid sm:grid-cols-3">
        {columns.map((column) => (
          <Column key={column.list.id} {...column} />
        ))}
      </div>
    </div>
  );
}
