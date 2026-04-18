import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootExternalProjectsAdminClient } from './root-admin-client';

const {
  createCanonicalExternalProjectMock,
  updateCanonicalExternalProjectMock,
  updateWorkspaceExternalProjectBindingMock,
} = vi.hoisted(() => ({
  createCanonicalExternalProjectMock: vi.fn(),
  updateCanonicalExternalProjectMock: vi.fn(),
  updateWorkspaceExternalProjectBindingMock: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  createCanonicalExternalProject: createCanonicalExternalProjectMock,
  updateCanonicalExternalProject: updateCanonicalExternalProjectMock,
  updateWorkspaceExternalProjectBinding:
    updateWorkspaceExternalProjectBindingMock,
}));

describe('RootExternalProjectsAdminClient', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 0,
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  it('filters the registry and prepares the binding preview from a project card', () => {
    render(
      <RootExternalProjectsAdminClient
        initialAudits={[
          {
            actor_user_id: 'user-1',
            changed_at: '2026-04-18T00:00:00.000Z',
            destination_ws_id: 'ws-live',
            id: 'audit-1',
            next_canonical_id: 'project-yoola',
            previous_canonical_id: null,
            source_ws_id: 'platform',
          } as any,
        ]}
        initialProjects={[
          {
            adapter: 'yoola',
            allowed_collections: ['artworks', 'lore-capsules'],
            allowed_features: [],
            delivery_profile: { adapter: 'yoola' },
            display_name: 'Yoola Archive',
            id: 'project-yoola',
            is_active: true,
            metadata: {},
          } as any,
          {
            adapter: 'junly',
            allowed_collections: ['articles'],
            allowed_features: [],
            delivery_profile: { adapter: 'junly' },
            display_name: 'Junly Stories',
            id: 'project-junly',
            is_active: true,
            metadata: {},
          } as any,
        ]}
        strings={{
          actionPanelDescription: 'Quick actions for canonical projects.',
          actionPanelTitle: 'Action panel',
          activeLabel: 'Active',
          activeProjectsLabel: 'Active projects',
          adapterCoverageLabel: 'Adapter coverage',
          adapterLabel: 'Adapter',
          allAdaptersLabel: 'All adapters',
          auditFeedDescription: 'Recent binding changes.',
          bindAction: 'Bind',
          bindDescription: 'Bind a workspace to a canonical project.',
          bindTitle: 'Workspace binding',
          bindingPreviewLabel: 'Binding preview',
          canonicalIdLabel: 'Canonical project',
          createAction: 'Create project',
          createDescription: 'Create a new canonical project.',
          createTitle: 'Create canonical project',
          deliveryProfileHint: 'JSON delivery profile',
          deliveryProfileLabel: 'Delivery profile',
          displayNameLabel: 'Display name',
          inactiveLabel: 'Inactive',
          invalidJsonLabel: 'Invalid JSON',
          liveBindingsLabel: 'Live bindings',
          noAuditsDescription: 'No audit activity yet.',
          noAuditsTitle: 'No audits',
          noProjectsDescription: 'No projects configured.',
          noProjectsTitle: 'No projects',
          overviewDescription: 'Manage registry and workspace bindings.',
          overviewTitle: 'External projects',
          recentAuditsTitle: 'Recent audits',
          recommendedCollectionsLabel: 'Recommended collections',
          registryDescription: 'Search the canonical registry.',
          registryTitle: 'Registry',
          resultsLabel: 'results',
          rootSearchPlaceholder: 'Search projects',
          saveAction: 'Save',
          searchEmptyDescription: 'Try a different search.',
          searchEmptyTitle: 'Nothing found',
          totalProjectsLabel: 'Total projects',
          unbindAction: 'Unbind',
          unboundLabel: 'Unbound',
          useForBindingAction: 'Use for binding',
          workspaceIdLabel: 'Workspace ID',
        }}
      />,
      { wrapper }
    );

    expect(screen.getByText('2 results')).toBeInTheDocument();
    expect(screen.getAllByText('Yoola Archive').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Junly Stories').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText('Search projects'), {
      target: { value: 'junly' },
    });

    expect(screen.getByText('1 results')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Use for binding' }).length
    ).toBe(1);
    expect(screen.getAllByText('Junly Stories').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Use for binding' }));

    expect(screen.getAllByText('Junly Stories').length).toBeGreaterThan(0);
    expect(screen.getByText('project-junly · Junly')).toBeInTheDocument();
  });
});
