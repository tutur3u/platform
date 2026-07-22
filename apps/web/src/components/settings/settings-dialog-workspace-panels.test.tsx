import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { Workspace } from '@tuturuuu/types';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceMembersSettingsPanel } from './settings-dialog-workspace-panels';

const {
  guestSelfJoinMock,
  inviteLinksMock,
  standardWorkspaceAccessMock,
  queryState,
} = vi.hoisted(() => ({
  guestSelfJoinMock: vi.fn(),
  inviteLinksMock: vi.fn(),
  queryState: {
    disableInvite: false,
  },
  standardWorkspaceAccessMock: vi.fn(),
}));

vi.mock(
  '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/members/_components/invite-links-section',
  () => ({
    default: (props: Record<string, unknown>) => {
      inviteLinksMock(props);
      return <div data-testid="invite-links-section" />;
    },
  })
);

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { disableInvite: queryState.disableInvite } }),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getWorkspaceMemberSettings: vi.fn(),
}));

vi.mock('@tuturuuu/ui/custom/workspace-access', () => ({
  StandardWorkspaceAccessPage: (props: Record<string, unknown>) => {
    standardWorkspaceAccessMock(props);
    return <div data-testid="standard-workspace-access-page" />;
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock(
  '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/members/_components/guest-self-join-setting',
  () => ({
    GuestSelfJoinSetting: (props: Record<string, unknown>) => {
      guestSelfJoinMock(props);
      return <div data-testid="guest-self-join-setting" />;
    },
  })
);

vi.mock(
  '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/settings/avatar',
  () => ({
    default: () => null,
  })
);

vi.mock(
  '../../app/[locale]/(dashboard)/[wsId]/(workspace-settings)/settings/basic-info',
  () => ({
    default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  })
);

const workspace = {
  id: 'ws_1',
  name: 'Workspace',
  personal: false,
} as Workspace;

describe('WorkspaceMembersSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryState.disableInvite = false;
  });

  it('renders StandardWorkspaceAccessPage with role management when allowed', () => {
    queryState.disableInvite = true;

    render(
      <WorkspaceMembersSettingsPanel
        canManageWorkspaceMembers
        canManageWorkspaceRoles
        currentUserEmail="ada@example.com"
        isLoadingWorkspace={false}
        workspace={workspace}
        workspaceError={null}
      />
    );

    expect(screen.getByTestId('standard-workspace-access-page')).toBeVisible();
    expect(screen.getByTestId('invite-links-section')).toBeVisible();
    expect(guestSelfJoinMock).toHaveBeenCalledWith({
      disabled: false,
      embedded: true,
      wsId: 'ws_1',
    });
    expect(inviteLinksMock).toHaveBeenCalledWith({
      canManageMembers: true,
      disableInvite: true,
      embedded: true,
      wsId: 'ws_1',
    });
    expect(standardWorkspaceAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        disableInvite: true,
        initialContext: {
          canManageMembers: true,
          canManageRoles: true,
          currentUserEmail: 'ada@example.com',
          workspaceId: 'ws_1',
        },
        initialTab: 'people',
        showHeader: false,
      })
    );
  });

  it('keeps member management while hiding role-management actions when denied', () => {
    render(
      <WorkspaceMembersSettingsPanel
        canManageWorkspaceMembers
        canManageWorkspaceRoles={false}
        currentUserEmail="ada@example.com"
        isLoadingWorkspace={false}
        workspace={workspace}
        workspaceError={null}
      />
    );

    expect(standardWorkspaceAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialContext: {
          canManageMembers: true,
          canManageRoles: false,
          currentUserEmail: 'ada@example.com',
          workspaceId: 'ws_1',
        },
      })
    );
    expect(screen.getByTestId('invite-links-section')).toBeVisible();
  });

  it('does not expose invite links without member-management permission', () => {
    render(
      <WorkspaceMembersSettingsPanel
        canManageWorkspaceMembers={false}
        canManageWorkspaceRoles
        currentUserEmail="ada@example.com"
        isLoadingWorkspace={false}
        workspace={workspace}
        workspaceError={null}
      />
    );

    expect(
      screen.queryByTestId('invite-links-section')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('standard-workspace-access-page')).toBeVisible();
  });

  it('disables guest access and invitations in personal workspaces', () => {
    render(
      <WorkspaceMembersSettingsPanel
        canManageWorkspaceMembers
        canManageWorkspaceRoles
        currentUserEmail="ada@example.com"
        isLoadingWorkspace={false}
        workspace={{ ...workspace, personal: true }}
        workspaceError={null}
      />
    );

    expect(guestSelfJoinMock).toHaveBeenCalledWith({
      disabled: true,
      embedded: true,
      wsId: 'ws_1',
    });
    expect(inviteLinksMock).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId('invite-links-section')
    ).not.toBeInTheDocument();
    expect(standardWorkspaceAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ disableInvite: true })
    );
  });
});
