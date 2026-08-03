'use client';

import { Check, Clock, UserX, X } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';

export type AttendanceMember = {
  id: string;
  display_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  archived?: boolean;
  archived_until?: string | null;
  note?: string | null;
  role?: string | null;
  isGuest?: boolean;
};

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'NONE';

export type AttendanceEntry = {
  status: AttendanceStatus;
  note?: string;
};

interface Props {
  canEdit: boolean;
  entry: AttendanceEntry;
  hasPendingChanges: boolean;
  member: AttendanceMember;
  onClear: () => void;
  onNoteChange: (note: string) => void;
  onStatusChange: (status: AttendanceStatus) => void;
}

const STATUS_BUTTON_STYLES: Record<
  Exclude<AttendanceStatus, 'NONE'>,
  { active: string; inactive: string }
> = {
  PRESENT: {
    active:
      'border-dynamic-green/40 bg-dynamic-green/20 text-dynamic-green hover:bg-dynamic-green/30',
    inactive:
      'border-dynamic-green/20 bg-dynamic-green/5 text-dynamic-green/70 hover:border-dynamic-green/40 hover:bg-dynamic-green/10 hover:text-dynamic-green',
  },
  ABSENT: {
    active:
      'border-dynamic-red/40 bg-dynamic-red/20 text-dynamic-red hover:bg-dynamic-red/30',
    inactive:
      'border-dynamic-red/20 bg-dynamic-red/5 text-dynamic-red/70 hover:border-dynamic-red/40 hover:bg-dynamic-red/10 hover:text-dynamic-red',
  },
  LATE: {
    active:
      'border-dynamic-yellow/40 bg-dynamic-yellow/20 text-dynamic-yellow hover:bg-dynamic-yellow/30',
    inactive:
      'border-dynamic-yellow/20 bg-dynamic-yellow/5 text-dynamic-yellow/70 hover:border-dynamic-yellow/40 hover:bg-dynamic-yellow/10 hover:text-dynamic-yellow',
  },
};

export function GroupAttendanceMemberCard({
  canEdit,
  entry,
  hasPendingChanges,
  member,
  onClear,
  onNoteChange,
  onStatusChange,
}: Props) {
  const tAtt = useTranslations('ws-user-group-attendance');
  const tDetails = useTranslations('ws-user-group-details');
  const tGuests = useTranslations('meet-together');
  const tUsers = useTranslations('ws-users');
  const isArchived =
    member.archived ||
    !!(member.archived_until && new Date(member.archived_until) > new Date());

  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col gap-3 rounded-lg border p-3 shadow-sm transition-shadow hover:shadow-md sm:gap-4 sm:p-4',
        hasPendingChanges
          ? 'border-dynamic-blue/30 bg-dynamic-blue/5 ring-1 ring-dynamic-blue/20'
          : 'border-foreground/10 bg-foreground/5'
      )}
    >
      {hasPendingChanges && (
        <div className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-dynamic-blue text-white shadow-sm">
          <span className="font-bold text-xs">•</span>
        </div>
      )}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 shrink-0 sm:h-12 sm:w-12">
            <AvatarImage src={member.avatar_url ?? undefined} />
            <AvatarFallback className="font-semibold">
              {(member.display_name || member.full_name || '?')
                .slice(0, 1)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div
                className={cn(
                  'min-w-0 break-words font-semibold text-base',
                  isArchived &&
                    'text-dynamic-red line-through decoration-2 decoration-dynamic-red'
                )}
              >
                {member.full_name
                  ? member.display_name
                    ? `${member.full_name} (${member.display_name})`
                    : member.full_name
                  : member.display_name || member.email || 'Unknown'}
              </div>
              {member.role === 'TEACHER' && (
                <Badge
                  variant="default"
                  className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green"
                >
                  {tDetails('managers')}
                </Badge>
              )}
              {!!member.isGuest && member.role !== 'TEACHER' && (
                <Badge
                  variant="secondary"
                  className="border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange"
                >
                  {tGuests('guests')}
                </Badge>
              )}
            </div>
            <div className="truncate text-foreground/60 text-sm">
              {member.phone || tAtt('phone_fallback')}
            </div>
            {isArchived && (
              <div className="mt-1 font-semibold text-dynamic-red text-xs">
                {member.archived_until &&
                new Date(member.archived_until) > new Date() ? (
                  <>
                    {tUsers('status_archived_until')}:{' '}
                    {format(
                      new Date(member.archived_until),
                      'dd/MM/yyyy HH:mm'
                    )}
                  </>
                ) : (
                  tUsers('status_archived')
                )}
                {member.note && <div>{member.note}</div>}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center gap-2 font-medium text-foreground/60 text-xs">
            <span>{tAtt('status_label')}:</span>
            {entry.status !== 'NONE' ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold',
                  entry.status === 'PRESENT' &&
                    'border-dynamic-green/30 bg-dynamic-green/15 text-dynamic-green',
                  entry.status === 'ABSENT' &&
                    'border-dynamic-red/30 bg-dynamic-red/15 text-dynamic-red',
                  entry.status === 'LATE' &&
                    'border-dynamic-yellow/30 bg-dynamic-yellow/15 text-dynamic-yellow'
                )}
              >
                {entry.status === 'PRESENT' && (
                  <>
                    <Check className="h-3 w-3" />
                    {tAtt('present')}
                  </>
                )}
                {entry.status === 'ABSENT' && (
                  <>
                    <UserX className="h-3 w-3" />
                    {tAtt('absent')}
                  </>
                )}
                {entry.status === 'LATE' && (
                  <>
                    <Clock className="h-3 w-3" />
                    {tAtt('late')}
                  </>
                )}
              </span>
            ) : (
              <span className="text-foreground/40">-</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {(['PRESENT', 'ABSENT', 'LATE'] as const).map((status) => {
              const Icon =
                status === 'PRESENT'
                  ? Check
                  : status === 'ABSENT'
                    ? UserX
                    : Clock;
              const styles = STATUS_BUTTON_STYLES[status];
              return (
                <Button
                  key={status}
                  size="sm"
                  disabled={!canEdit}
                  aria-pressed={entry.status === status}
                  variant="ghost"
                  className={cn(
                    'h-auto min-w-0 flex-col gap-1 border-2 px-2 py-3 transition-all',
                    entry.status !== 'NONE' &&
                      entry.status !== status &&
                      'opacity-20 grayscale hover:opacity-100 hover:grayscale-0',
                    entry.status === status ? styles.active : styles.inactive
                  )}
                  onClick={() => onStatusChange(status)}
                >
                  <Icon className="h-5 w-5" />
                  <span className="max-w-full break-words text-center font-semibold text-[11px] leading-tight sm:text-xs">
                    {tAtt(status.toLowerCase())}
                  </span>
                </Button>
              );
            })}
          </div>
          {entry.status !== 'NONE' && (
            <Button
              size="sm"
              disabled={!canEdit}
              variant="ghost"
              className="gap-2 border-2 border-foreground/20 bg-foreground/5 transition-all hover:border-foreground/30 hover:bg-foreground/10"
              onClick={onClear}
            >
              <X className="h-4 w-4" />
              <span className="text-sm">{tAtt('clear')}</span>
            </Button>
          )}
        </div>
      </div>
      <div className="border-foreground/10 border-t" />
      <div className="flex flex-col gap-2">
        <Label
          htmlFor={`attendance-notes-${member.id}`}
          className="font-medium text-sm"
        >
          {tAtt('notes_placeholder')}
        </Label>
        <Textarea
          disabled={!canEdit}
          id={`attendance-notes-${member.id}`}
          name={`attendance-notes-${member.id}`}
          value={entry.note || ''}
          onChange={(event) => {
            onNoteChange(event.target.value);
            event.target.style.height = 'auto';
            event.target.style.height = `${event.target.scrollHeight}px`;
          }}
          onFocus={(event) => {
            event.target.style.height = 'auto';
            event.target.style.height = `${event.target.scrollHeight}px`;
          }}
          className="min-h-10 resize-none bg-card transition-all"
          rows={1}
          placeholder={tAtt('notes_placeholder')}
        />
      </div>
    </div>
  );
}
