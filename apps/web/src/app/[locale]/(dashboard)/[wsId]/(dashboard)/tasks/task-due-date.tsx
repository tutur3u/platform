'use client';

import { Calendar } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { format, isThisWeek, isToday, isTomorrow } from 'date-fns';

export default function TaskDueDate({ dueDate }: { dueDate: string }) {
  const getDueDateLabel = (dueDate: string) => {
    const date = new Date(dueDate);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isThisWeek(date)) return format(date, 'EEEE');
    return format(date, 'MMM d');
  };

  const getDueDateColor = (dueDate: string) => {
    const date = new Date(dueDate);
    const now = new Date();

    if (date < now)
      return 'text-dynamic-red bg-dynamic-red/10 border-dynamic-red/20';
    if (isToday(date))
      return 'text-dynamic-orange bg-dynamic-orange/10 border-dynamic-orange/20';
    if (isTomorrow(date))
      return 'text-dynamic-yellow bg-dynamic-yellow/10 border-dynamic-yellow/20';
    return 'text-dynamic-blue bg-dynamic-blue/10 border-dynamic-blue/20';
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium text-xs',
        getDueDateColor(dueDate)
      )}
    >
      <Calendar className="h-3 w-3" />
      Due {getDueDateLabel(dueDate)}
    </div>
  );
}
