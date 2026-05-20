import type { TopicAnnouncementPayload } from '@tuturuuu/internal-api';
import { NO_GROUP, NO_TEMPLATE } from './topic-announcements-form-constants';

export const ANNOUNCEMENT_STEPS = [
  'details',
  'message',
  'recipients',
  'review',
] as const;

export const DELIVERY_MODES = ['draft', 'send', 'schedule'] as const;

export const INITIAL_ANNOUNCEMENT_FORM = {
  contactIds: [] as string[],
  endTime: '',
  groupId: NO_GROUP,
  place: '',
  room: '',
  selectedTemplateId: NO_TEMPLATE,
  startTime: '',
  title: '',
  topic: '',
};

export type AnnouncementDeliveryMode = (typeof DELIVERY_MODES)[number];
export type AnnouncementFormValues = typeof INITIAL_ANNOUNCEMENT_FORM;
export type AnnouncementStep = (typeof ANNOUNCEMENT_STEPS)[number];

export function buildTopicAnnouncementPayload(
  form: AnnouncementFormValues
): TopicAnnouncementPayload {
  return {
    contactIds: form.contactIds,
    endTime: form.endTime || null,
    groupId: form.groupId === NO_GROUP ? null : form.groupId,
    place: form.place || null,
    room: form.room || null,
    sourceType: 'manual',
    startTime: form.startTime || null,
    title: form.title.trim(),
    topic: form.topic.trim(),
  };
}

export function createDefaultScheduledDate() {
  const next = new Date();
  next.setMinutes(next.getMinutes() + 30, 0, 0);
  return next;
}

export function getAnnouncementStepValidity(form: AnnouncementFormValues) {
  const details = form.title.trim().length > 0;
  const message = form.topic.trim().length > 0;
  const recipients = form.contactIds.length > 0;

  return {
    details,
    message,
    recipients,
    review: details && message && recipients,
  } satisfies Record<AnnouncementStep, boolean>;
}
