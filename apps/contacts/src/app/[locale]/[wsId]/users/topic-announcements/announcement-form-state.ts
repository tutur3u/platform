import type {
  TopicAnnouncementPayload,
  TopicAnnouncementRecord,
} from '@tuturuuu/internal-api';
import type { PreviewableTopicAnnouncementAttachment } from './announcement-attachment-types';
import { toTopicAnnouncementAttachmentDraft } from './announcement-attachment-types';
import { NO_GROUP, NO_TEMPLATE } from './topic-announcements-form-constants';

export const MAX_ANNOUNCEMENT_ATTACHMENTS = 5;
export const MAX_ANNOUNCEMENT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ANNOUNCEMENT_ATTACHMENT_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.gif,.webp,application/pdf,image/png,image/jpeg,image/gif,image/webp';
export const ANNOUNCEMENT_ATTACHMENT_CONTENT_TYPES = [
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const ANNOUNCEMENT_STEPS = [
  'details',
  'message',
  'recipients',
  'review',
] as const;

export const DELIVERY_MODES = ['draft', 'send', 'schedule'] as const;

export const NO_TEACHER = '__none__';
const VIDEO_URL_PATTERN = /^https:\/\/\S+$/u;

/** Mirrors the server and database rule: empty, or an https:// URL. */
export function isTopicVideoUrlValid(value: string) {
  const trimmed = value.trim();
  return !trimmed || VIDEO_URL_PATTERN.test(trimmed);
}

export const INITIAL_ANNOUNCEMENT_FORM = {
  attachmentDrafts: [] as PreviewableTopicAnnouncementAttachment[],
  classLabel: '',
  contactIds: [] as string[],
  courseBook: '',
  dayLabel: '',
  endTime: '',
  groupId: NO_GROUP,
  notifyTeacher: true,
  place: '',
  room: '',
  selectedTemplateId: NO_TEMPLATE,
  sessionDate: '',
  startTime: '',
  teacherWorkspaceUserId: NO_TEACHER,
  title: '',
  topic: '',
  videoUrl: '',
};

export type AnnouncementDeliveryMode = (typeof DELIVERY_MODES)[number];
export type AnnouncementFormValues = typeof INITIAL_ANNOUNCEMENT_FORM;
export type AnnouncementStep = (typeof ANNOUNCEMENT_STEPS)[number];

export function buildTopicAnnouncementPayload(
  form: AnnouncementFormValues,
  { teacherAssignments = true }: { teacherAssignments?: boolean } = {}
): TopicAnnouncementPayload {
  const payload: TopicAnnouncementPayload = {
    attachmentDrafts: form.attachmentDrafts.map(
      toTopicAnnouncementAttachmentDraft
    ),
    classLabel: form.classLabel || null,
    contactIds: form.contactIds,
    courseBook: form.courseBook.trim() || null,
    dayLabel: form.dayLabel || null,
    endTime: form.endTime || null,
    groupId: form.groupId === NO_GROUP ? null : form.groupId,
    place: form.place || null,
    room: form.room || null,
    sessionDate: form.sessionDate || null,
    sourceType: 'manual',
    startTime: form.startTime || null,
    teacherWorkspaceUserId:
      form.teacherWorkspaceUserId === NO_TEACHER
        ? null
        : form.teacherWorkspaceUserId,
    title: form.title.trim(),
    topic: form.topic.trim(),
    videoUrl: form.videoUrl.trim() || null,
  };
  if (teacherAssignments) return payload;
  // Without teacher assignments, send the pre-feature payload shape.
  const {
    courseBook: _courseBook,
    teacherWorkspaceUserId: _teacherWorkspaceUserId,
    videoUrl: _videoUrl,
    ...legacy
  } = payload;
  return legacy;
}

function normalizeTime(value: string | null) {
  if (!value) return '';

  const [hours, minutes] = value.split(':');
  if (!hours || !minutes) return value;

  return `${hours.padStart(2, '0')}:${minutes}`;
}

export function createAnnouncementFormFromRecord(
  announcement: TopicAnnouncementRecord
): AnnouncementFormValues {
  return {
    attachmentDrafts: announcement.attachments.map((attachment) => ({
      contentType: attachment.contentType,
      fileName: attachment.fileName,
      sizeBytes: attachment.sizeBytes,
      storagePath: attachment.storagePath,
      storageProvider: attachment.storageProvider,
    })),
    classLabel: announcement.class_label ?? '',
    contactIds: announcement.contacts.map((contact) => contact.id),
    courseBook: announcement.course_book ?? '',
    dayLabel: announcement.day_label ?? '',
    endTime: normalizeTime(announcement.end_time),
    groupId: announcement.group_id ?? NO_GROUP,
    notifyTeacher: true,
    place: announcement.place ?? '',
    room: announcement.room ?? '',
    selectedTemplateId: NO_TEMPLATE,
    sessionDate: announcement.session_date ?? '',
    startTime: normalizeTime(announcement.start_time),
    teacherWorkspaceUserId:
      announcement.teacher_workspace_user_id ?? NO_TEACHER,
    title: announcement.title,
    topic: announcement.topic,
    videoUrl: announcement.video_url ?? '',
  };
}

export function createDefaultScheduledDate() {
  const next = new Date();
  next.setMinutes(next.getMinutes() + 30, 0, 0);
  return next;
}

export function getAnnouncementStepValidity(form: AnnouncementFormValues) {
  const details = form.title.trim().length > 0;
  // An assigned teacher writes the topic later, so the supervisor may save a
  // draft session without one; sending still requires a topic.
  const message =
    (form.topic.trim().length > 0 ||
      form.teacherWorkspaceUserId !== NO_TEACHER) &&
    isTopicVideoUrlValid(form.videoUrl);
  const recipients = form.contactIds.length > 0;

  return {
    details,
    message,
    recipients,
    review: details && message && recipients,
  } satisfies Record<AnnouncementStep, boolean>;
}
