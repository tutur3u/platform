import { createTopicAnnouncementPreviewHandler } from '@tuturuuu/users-core/routes/topic-announcements';
import { resolveTopicAnnouncementsAccess } from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/shared';
export const POST = createTopicAnnouncementPreviewHandler(
  resolveTopicAnnouncementsAccess
);
