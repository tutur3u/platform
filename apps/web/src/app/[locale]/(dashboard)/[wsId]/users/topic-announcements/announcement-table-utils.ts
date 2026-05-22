import type { TopicAnnouncementRecord } from '@tuturuuu/internal-api';

export const ANNOUNCEMENT_STATUS_LABEL_KEYS = {
  cancelled: 'status_cancelled',
  draft: 'status_draft',
  failed: 'status_failed',
  queued: 'status_queued',
  sent: 'status_sent',
  skipped: 'status_skipped',
} as const;

export const tableHeadClassName =
  'h-9 border-border/80 border-r bg-dynamic-blue/15 px-2 font-semibold text-foreground text-xs uppercase';
export const tableCellClassName =
  'border-border/70 border-r px-2 py-1.5 align-top';

export function canSendAnnouncement(announcement: TopicAnnouncementRecord) {
  return announcement.contacts.every((contact) =>
    ['verified', 'linked_confirmed_account'].includes(
      contact.verificationStatus
    )
  );
}

export function countUnverifiedRecipients(
  announcement: TopicAnnouncementRecord
) {
  return announcement.contacts.filter((contact) =>
    ['needs_verification', 'pending'].includes(contact.verificationStatus)
  ).length;
}

export function canRemoveAnnouncement(announcement: TopicAnnouncementRecord) {
  return ['draft', 'queued', 'failed', 'skipped'].includes(announcement.status);
}

function formatTimeValue(value: string | null) {
  if (!value) return null;

  const [hours, minutes] = value.split(':');
  if (!hours || !minutes) return value;

  return `${hours.padStart(2, '0')}:${minutes}`;
}

export function formatTimeRange(announcement: TopicAnnouncementRecord) {
  const startTime = formatTimeValue(announcement.start_time);
  const endTime = formatTimeValue(announcement.end_time);

  if (startTime && endTime) return `${startTime} - ${endTime}`;
  return startTime ?? endTime;
}

function formatSessionDate(value: string | null) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    weekday: 'short',
  }).format(date);
}

export function getDayLabel(announcement: TopicAnnouncementRecord) {
  return announcement.day_label || formatSessionDate(announcement.session_date);
}

export function getClassLabel(announcement: TopicAnnouncementRecord) {
  return announcement.class_label || announcement.group?.name || null;
}

export function getTeacherLabel(announcement: TopicAnnouncementRecord) {
  return announcement.contacts
    .map((contact) => contact.name.trim())
    .filter(Boolean)
    .join(', ');
}

export function getRowClassName(status: TopicAnnouncementRecord['status']) {
  if (status === 'queued') return 'bg-dynamic-blue/5';
  if (status === 'sent') return 'bg-dynamic-green/5';
  if (status === 'failed') return 'bg-dynamic-red/5';
  if (status === 'skipped') return 'bg-dynamic-orange/5';
  if (status === 'cancelled') return 'bg-muted/60 text-muted-foreground';
  return 'bg-background';
}
