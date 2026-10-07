import { createTopicAnnouncementListHandler } from '@tuturuuu/users-core/routes/topic-announcements';
import { resolveContactsTopicAnnouncementsAccess } from '@/lib/topic-announcements-access';

export const GET = createTopicAnnouncementListHandler(
  resolveContactsTopicAnnouncementsAccess
);
