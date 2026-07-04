'use client';

import { Check, Clock, UserX } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { AttendanceEntry, AttendanceStatus } from './types';

const statusOptions: Array<{
  icon: typeof Check;
  status: Exclude<AttendanceStatus, 'NONE'>;
  tone: 'green' | 'red' | 'yellow';
}> = [
  { icon: Check, status: 'PRESENT', tone: 'green' },
  { icon: UserX, status: 'ABSENT', tone: 'red' },
  { icon: Clock, status: 'LATE', tone: 'yellow' },
];

const toneClasses = {
  green: {
    active:
      'border-dynamic-green/40 bg-dynamic-green/20 text-dynamic-green hover:bg-dynamic-green/30',
    badge: 'border-dynamic-green/30 bg-dynamic-green/15 text-dynamic-green',
    idle: 'border-dynamic-green/20 bg-dynamic-green/5 text-dynamic-green/70 hover:border-dynamic-green/40 hover:bg-dynamic-green/10 hover:text-dynamic-green',
  },
  red: {
    active:
      'border-dynamic-red/40 bg-dynamic-red/20 text-dynamic-red hover:bg-dynamic-red/30',
    badge: 'border-dynamic-red/30 bg-dynamic-red/15 text-dynamic-red',
    idle: 'border-dynamic-red/20 bg-dynamic-red/5 text-dynamic-red/70 hover:border-dynamic-red/40 hover:bg-dynamic-red/10 hover:text-dynamic-red',
  },
  yellow: {
    active:
      'border-dynamic-yellow/40 bg-dynamic-yellow/20 text-dynamic-yellow hover:bg-dynamic-yellow/30',
    badge: 'border-dynamic-yellow/30 bg-dynamic-yellow/15 text-dynamic-yellow',
    idle: 'border-dynamic-yellow/20 bg-dynamic-yellow/5 text-dynamic-yellow/70 hover:border-dynamic-yellow/40 hover:bg-dynamic-yellow/10 hover:text-dynamic-yellow',
  },
} as const;

export function AttendanceStatusControls({
  canUpdateAttendance,
  entry,
  onStatusToggle,
}: {
  canUpdateAttendance: boolean;
  entry: AttendanceEntry;
  onStatusToggle: (status: AttendanceStatus) => void;
}) {
  const tAtt = useTranslations('ws-user-group-attendance');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-center gap-2 font-medium text-foreground/60 text-xs">
        <span>{tAtt('status_label')}:</span>
        {entry.status !== 'NONE' ? (
          <StatusBadge status={entry.status} />
        ) : (
          <span className="text-foreground/40">-</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {statusOptions.map(({ icon: Icon, status, tone }) => (
          <Button
            aria-pressed={entry.status === status}
            className={cn(
              'h-auto flex-col gap-1 border-2 py-3 transition-all',
              entry.status !== 'NONE' &&
                entry.status !== status &&
                'opacity-20 grayscale hover:opacity-100 hover:grayscale-0',
              entry.status === status
                ? toneClasses[tone].active
                : toneClasses[tone].idle
            )}
            disabled={!canUpdateAttendance}
            key={status}
            onClick={() => onStatusToggle(status)}
            size="sm"
            variant="ghost"
          >
            <Icon className="h-5 w-5" />
            <span className="font-semibold text-xs">
              {tAtt(status.toLowerCase())}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: Exclude<AttendanceStatus, 'NONE'>;
}) {
  const tAtt = useTranslations('ws-user-group-attendance');
  const option = statusOptions.find((entry) => entry.status === status);
  const Icon = option?.icon ?? Check;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold',
        option ? toneClasses[option.tone].badge : toneClasses.green.badge
      )}
    >
      <Icon className="h-3 w-3" />
      {tAtt(status.toLowerCase())}
    </span>
  );
}
