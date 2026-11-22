import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import type { WorkspaceAccessAdapter } from './types';
import { WorkspaceAccessPage } from './workspace-access-page';

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

const WS_ID = 'ws-1';

function createAdapter(
  overrides: Partial<WorkspaceAccessAdapter> = {}
): WorkspaceAccessAdapter {
  return {
    addRoleMembers: vi.fn(),
    createRole: vi.fn(),
    deleteRole: vi.fn(),
    getDefaultRole: vi.fn().mockResolvedValue({
      id: 'default',
      name: 'default',
      permissions: [],
    }),
    hardenDefaultAdmin: vi.fn(),
    inviteMembers: vi.fn(),
    listMembers: vi.fn().mockResolvedValue([]),
    listRoles: vi.fn().mockResolvedValue({ count: 0, data: [] }),
    removeMember: vi.fn(),
    removeRoleMember: vi.fn(),
    updateDefaultRole: vi.fn(),
    updateMemberProfile: vi.fn(),
    updateRole: vi.fn(),
    ...overrides,
  } as unknown as WorkspaceAccessAdapter;
}

function renderPage(canManageRoles: boolean, adapter: WorkspaceAccessAdapter) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const ui = (props: { canManageRoles: boolean }) => (
    <QueryClientProvider client={queryClient}>
      <WorkspaceAccessPage
        adapter={adapter}
        initialContext={{
          canManageMembers: true,
          canManageRoles: props.canManageRoles,
          currentUserEmail: 'admin@example.com',
          currentUserId: 'admin-id',
          workspaceId: WS_ID,
        }}
        initialTab="people"
      />
    </QueryClientProvider>
  );

  const view = render(ui({ canManageRoles }) as ReactNode);

  return {
    ...view,
    setCanManageRoles: (next: boolean) =>
      view.rerender(ui({ canManageRoles: next }) as ReactNode),
  };
}

// The tabs are Radix triggers (role="tab"); roles is the second of four, and its
// label comes from the adapter's label set rather than a fixed string.
function rolesTab() {
  return screen.getAllByRole('tab')[1];
}

describe('WorkspaceAccessPage permission context', () => {
  it.each([
    ['admin-id', 'ws-members.last_manager_leave_refused'],
    ['colleague-id', 'ws-members.last_manager_removal_refused'],
  ])('uses the refusal for the member targeted by %s', async (userId, key) => {
    const member = {
      id: userId,
      display_name: 'Manager',
      email: 'member@example.com',
      is_creator: false,
      roles: [],
      workspace_member_type: 'MEMBER',
    } as InternalApiEnhancedWorkspaceMember;
    const error = Object.assign(new Error('Manager floor'), {
      code: 'WORKSPACE_LAST_MANAGER',
    });
    const removeMember = vi.fn().mockRejectedValue(error);
    renderPage(
      false,
      createAdapter({
        listMembers: vi.fn().mockResolvedValue([member]),
        removeMember,
      })
    );

    fireEvent.pointerDown(
      await screen.findByRole('button', { name: 'common.actions' }),
      {
        button: 0,
        ctrlKey: false,
      }
    );
    fireEvent.click(await screen.findByText('ws-members.remove_member'));

    await waitFor(() => expect(toast.error).toHaveBeenLastCalledWith(key));
    expect(removeMember).toHaveBeenCalledExactlyOnceWith(WS_ID, {
      userId,
      email: 'member@example.com',
    });
    expect(screen.getByText('Manager')).toBeInTheDocument();
  });

  // Regression: callers resolve `manage_workspace_roles` asynchronously, so the
  // first render says false. The context used to be seeded into a disabled query
  // and served from there forever, which left admins with a Roles tab that never
  // enabled — no amount of waiting helped, only a full reload.
  it('follows the caller once the roles permission resolves', async () => {
    const { setCanManageRoles } = renderPage(false, createAdapter());

    await waitFor(() => expect(rolesTab()).toBeDefined());
    expect(rolesTab()).toBeDisabled();

    setCanManageRoles(true);

    await waitFor(() => expect(rolesTab()).not.toBeDisabled());
  });

  // An adapter that fetches its own context (the external-project/CMS one) keeps
  // reading through the query, seeded by the server-resolved context it is handed.
  it('leaves a context-fetching adapter on its own query', async () => {
    const getContext = vi.fn().mockResolvedValue({
      canManageMembers: true,
      canManageRoles: true,
      currentUserEmail: 'admin@example.com',
      workspaceId: WS_ID,
    });

    const { setCanManageRoles } = renderPage(
      true,
      createAdapter({ getContext })
    );

    await waitFor(() => expect(rolesTab()).not.toBeDisabled());

    // Prop churn does not yank control away from the adapter's own context.
    setCanManageRoles(false);
    await waitFor(() => expect(rolesTab()).not.toBeDisabled());
  });
});
