import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GroupOverview } from './group-overview';

const { neverResolves } = vi.hoisted(() => ({
  neverResolves: () => new Promise<never>(() => undefined),
}));

vi.mock('next/server', () => ({ connection: neverResolves }));
vi.mock('next-intl/server', () => ({ getTranslations: neverResolves }));
vi.mock('./overview-cards', () => ({
  LinkedProductsCardServer: neverResolves,
  MembersCardServer: neverResolves,
  PostsCardServer: neverResolves,
  ScheduleCardServer: neverResolves,
  StorageCardServer: neverResolves,
}));

describe('GroupOverview', () => {
  it('shows a stable skeleton for every independently streamed section', () => {
    const { container } = render(
      <GroupOverview
        wsId="workspace-1"
        groupId="group-1"
        searchParams={Promise.resolve({})}
        canViewPersonalInfo
        canViewPublicInfo
        canUpdateUserGroups
        canViewAuditLogs
        canViewUserGroupsPosts
        canCreateUserGroupsPosts
        canUpdateUserGroupsPosts
        canDeleteUserGroupsPosts
      />
    );

    expect(screen.getByTestId('group-overview-grid')).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-group-section-skeleton]')
    ).toHaveLength(6);
  });

  it('does not reserve unavailable sections', () => {
    const { container } = render(
      <GroupOverview
        wsId="workspace-1"
        groupId="group-1"
        searchParams={Promise.resolve({})}
        canViewPersonalInfo
        canViewPublicInfo
        canUpdateUserGroups={false}
        canViewAuditLogs={false}
        canViewUserGroupsPosts={false}
        canCreateUserGroupsPosts={false}
        canUpdateUserGroupsPosts={false}
        canDeleteUserGroupsPosts={false}
      />
    );

    expect(
      container.querySelectorAll('[data-group-section-skeleton]')
    ).toHaveLength(4);
  });
});
