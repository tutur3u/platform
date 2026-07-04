'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { AttendanceStatusControls } from './attendance-status-controls';
import type {
  AttendanceEntry,
  AttendanceMember,
  AttendanceStatus,
} from './types';

type AttendanceMemberCardProps = {
  canUpdateAttendance: boolean;
  entry: AttendanceEntry;
  hasPendingChanges: boolean;
  member: AttendanceMember;
  onNoteChange: (userId: string, note: string) => void;
  onStatusToggle: (userId: string, status: AttendanceStatus) => void;
};

export function AttendanceMemberCard({
  canUpdateAttendance,
  entry,
  hasPendingChanges,
  member,
  onNoteChange,
  onStatusToggle,
}: AttendanceMemberCardProps) {
  const tAtt = useTranslations('ws-user-group-attendance');
  const tDetails = useTranslations('ws-user-group-details');
  const tGuests = useTranslations('meet-together');
  const tUsers = useTranslations('ws-users');
  const archivedUntil =
    member.archived_until && new Date(member.archived_until) > new Date()
      ? new Date(member.archived_until)
      : null;
  const isArchived = Boolean(member.archived || archivedUntil);
  const displayName = member.full_name
    ? member.display_name
      ? `${member.full_name} (${member.display_name})`
      : member.full_name
    : member.display_name || member.email || 'Unknown';

  return (
    <div
      className={cn(
        'relative flex flex-col gap-4 rounded-lg border p-4 shadow-sm transition-all hover:shadow-md',
        hasPendingChanges
          ? 'border-dynamic-blue/30 bg-dynamic-blue/5 ring-1 ring-dynamic-blue/20'
          : 'border-foreground/10 bg-foreground/5'
      )}
    >
      {hasPendingChanges && (
        <div className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-dynamic-blue text-white shadow-sm">
          <span className="font-bold text-xs">*</span>
        </div>
      )}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarImage src={member.avatar_url ?? undefined} />
            <AvatarFallback className="font-semibold">
              {displayName.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'font-semibold text-base',
                  isArchived &&
                    'text-dynamic-red line-through decoration-2 decoration-dynamic-red'
                )}
              >
                {displayName}
              </div>
              {member.role === 'TEACHER' && (
                <Badge
                  className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green"
                  variant="default"
                >
                  {tDetails('managers')}
                </Badge>
              )}
              {!!member.isGuest && member.role !== 'TEACHER' && (
                <Badge
                  className="border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange"
                  variant="secondary"
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
                {archivedUntil ? (
                  <>
                    {tUsers('status_archived_until')}:{' '}
                    {format(archivedUntil, 'dd/MM/yyyy HH:mm')}
                  </>
                ) : (
                  tUsers('status_archived')
                )}
                {member.note && <div>{member.note}</div>}
              </div>
            )}
          </div>
        </div>
        <AttendanceStatusControls
          canUpdateAttendance={canUpdateAttendance}
          entry={entry}
          onStatusToggle={(status) => onStatusToggle(member.id, status)}
        />
      </div>
      <div className="h-px w-full bg-foreground/10" />
      <div className="space-y-2">
        <Label className="font-medium text-foreground/70 text-sm">
          {tAtt('note')}
        </Label>
        <Textarea
          className="min-h-[40px] resize-none bg-background/50"
          disabled={!canUpdateAttendance}
          onChange={(event) => onNoteChange(member.id, event.target.value)}
          placeholder={tAtt('note_placeholder')}
          value={entry.note || ''}
        />
      </div>
    </div>
  );
}
