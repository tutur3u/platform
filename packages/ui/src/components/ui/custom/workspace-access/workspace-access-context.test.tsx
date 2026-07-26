import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceAccessAdapter } from './types';
import { WorkspaceAccessPage } from './workspace-access-page';

vi.mock('next-intl', () => ({
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
