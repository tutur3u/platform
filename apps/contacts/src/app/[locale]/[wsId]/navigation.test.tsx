import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@tuturuuu/satellite/workspace-settings', () => ({
  createWorkspaceMembersNavLink: () => null,
}));

import { getNavigationLinks } from './navigation';

describe('topic schedule sidebar', () => {
  it.each([false, true])(
    'teacher flag %s controls the schedule child',
    async (teacherAssignmentsEnabled) => {
      const links = await getNavigationLinks({
        personalOrWsId: 'fixture',
        teacherAssignmentsEnabled,
      });
      const topic = links.find(
        (link) => link?.title === 'workspace-users-tabs.topic_announcements'
      );
      const schedule = topic?.children?.find(
        (link) => link?.href === '/fixture/users/topic-announcements/schedule'
      );
      expect(Boolean(schedule)).toBe(teacherAssignmentsEnabled);
    }
  );
});
