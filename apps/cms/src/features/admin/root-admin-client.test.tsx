// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RootExternalProjectsAdminClient } from './root-admin-client';

const internalApiMocks = vi.hoisted(() => ({
  createCanonicalExternalProject: vi.fn(),
  listCanonicalExternalProjects: vi.fn(),
  listExternalProjectWorkspaceBindings: vi.fn(),
  listWorkspaceExternalProjectBindingAudits: vi.fn(),
  updateCanonicalExternalProject: vi.fn(),
  updateWorkspaceExternalProjectBinding: vi.fn(),
}));

const translations: Record<string, string> = {
  'common.personal_account': 'Personal account',
  'common.unnamed-workspace': 'Unnamed workspace',
  'external-projects.root.active_label': 'Active',
  'external-projects.root.all_projects_label': 'All projects',
  'external-projects.root.all_site_types_label': 'All site types',
  'external-projects.root.connected_projects_label': 'Connected projects',
  'external-projects.root.connected_status_label': 'Connected',
  'external-projects.root.connection_error_title':
    'Connection could not be saved',
  'external-projects.root.create_template_action': 'Create template',
  'external-projects.root.create_template_description': 'Add a reusable setup.',
  'external-projects.root.create_template_title': 'New site template',
  'external-projects.root.developer_details_title': 'Developer details',
  'external-projects.root.developer_settings_hint': 'Advanced settings.',
  'external-projects.root.developer_settings_label': 'Developer settings',
  'external-projects.root.disconnect_action': 'Disconnect',
  'external-projects.root.display_name_label': 'Display name',
  'external-projects.root.grid_view_label': 'Grid view',
  'external-projects.root.history_empty_description': 'No changes yet.',
  'external-projects.root.history_empty_title': 'No history yet',
  'external-projects.root.history_title': 'Connection history',
  'external-projects.root.inactive_label': 'Inactive',
  'external-projects.root.internal_id_label': 'Internal ID',
  'external-projects.root.invalid_developer_settings_label':
    'Developer settings must use valid structured data.',
  'external-projects.root.last_changed_label': 'Last change',
  'external-projects.root.list_view_label': 'List view',
  'external-projects.root.manage_templates_action': 'Manage templates',
  'external-projects.root.no_template_option': 'No template',
  'external-projects.root.open_project_action': 'Open details',
  'external-projects.root.project_count_label': 'projects',
  'external-projects.root.project_details_description':
    'Review the site project, update its template connection, and inspect recent history.',
  'external-projects.root.project_empty_description':
    'Adjust filters to bring projects back.',
  'external-projects.root.project_empty_title': 'No projects match',
  'external-projects.root.project_search_label': 'Search projects',
  'external-projects.root.project_search_placeholder':
    'Search project name, internal ID, template, or site type',
  'external-projects.root.projects_badge': 'Internal site projects',
  'external-projects.root.projects_description':
    'Browse customer site projects first.',
  'external-projects.root.projects_title': 'CMS projects',
  'external-projects.root.recommended_sections_label': 'Recommended sections',
  'external-projects.root.refresh_action': 'Refresh',
  'external-projects.root.save_connection_action': 'Save connection',
  'external-projects.root.save_template_action': 'Save template',
  'external-projects.root.saving_action': 'Saving...',
  'external-projects.root.selected_template_label': 'Selected template',
  'external-projects.root.site_type_label': 'Site type',
  'external-projects.root.status_label': 'Status',
  'external-projects.root.template_empty_description':
    'Adjust filters to find another template.',
  'external-projects.root.template_empty_title': 'No templates match',
  'external-projects.root.template_key_label': 'Template key',
  'external-projects.root.template_label': 'Template',
  'external-projects.root.template_manager_description':
    'Create reusable site templates.',
  'external-projects.root.template_manager_title': 'Template manager',
  'external-projects.root.template_search_placeholder':
    'Search template key or display name',
  'external-projects.root.total_site_projects_label': 'Total projects',
  'external-projects.root.total_templates_label': 'Active templates',
  'external-projects.root.unbound_label': 'Unbound',
  'external-projects.root.unconnected_projects_label': 'Unconnected projects',
  'external-projects.root.unconnected_status_label': 'Unconnected',
};

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    translations[namespace ? `${namespace}.${key}` : key] ?? key,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  createCanonicalExternalProject:
    internalApiMocks.createCanonicalExternalProject,
  listCanonicalExternalProjects: internalApiMocks.listCanonicalExternalProjects,
  listExternalProjectWorkspaceBindings:
    internalApiMocks.listExternalProjectWorkspaceBindings,
  listWorkspaceExternalProjectBindingAudits:
    internalApiMocks.listWorkspaceExternalProjectBindingAudits,
  updateCanonicalExternalProject:
    internalApiMocks.updateCanonicalExternalProject,
  updateWorkspaceExternalProjectBinding:
    internalApiMocks.updateWorkspaceExternalProjectBinding,
}));

vi.mock('@/lib/external-projects/constants', () => ({
  DEFAULT_EXTERNAL_PROJECT_COLLECTIONS: {
    junly: ['research-projects'],
    yoola: ['artworks'],
  },
  EXTERNAL_PROJECT_ADAPTER_OPTIONS: ['junly', 'yoola'],
}));

const templates = [
  {
    adapter: 'yoola',
    allowed_collections: ['artworks'],
    allowed_features: [],
    delivery_profile: { adapter: 'yoola' },
    display_name: 'Yoola Template',
    id: 'yoola-main',
    is_active: true,
    metadata: {},
  },
  {
    adapter: 'junly',
    allowed_collections: ['research-projects'],
    allowed_features: [],
    delivery_profile: { adapter: 'junly' },
    display_name: 'Junly Template',
    id: 'junly-main',
    is_active: true,
    metadata: {},
  },
] as any[];

const bindings = [
  {
    avatar_url: null,
    binding: {
      adapter: 'yoola',
      canonical_id: 'yoola-main',
      canonical_project: templates[0],
      enabled: true,
      workspace_id: 'ws-yoola',
    },
    created_by_me: false,
    id: 'ws-yoola',
    last_actor_user_id: 'user-1',
    last_audit_id: 'audit-1',
    last_changed_at: '2026-05-30T00:00:00.000Z',
    last_next_canonical_id: 'yoola-main',
    last_previous_canonical_id: null,
    logo_url: null,
    name: 'Yoola Studio',
    personal: false,
  },
  {
    avatar_url: null,
    binding: {
      adapter: null,
      canonical_id: null,
      canonical_project: null,
      enabled: false,
      workspace_id: 'ws-junly',
    },
    created_by_me: false,
    id: 'ws-junly',
    last_actor_user_id: null,
    last_audit_id: null,
    last_changed_at: null,
    last_next_canonical_id: null,
    last_previous_canonical_id: null,
    logo_url: null,
    name: 'Junly Shop',
    personal: false,
  },
] as any[];

const audits = [
  {
    actor_user_id: 'user-1',
    changed_at: '2026-05-30T00:00:00.000Z',
    destination_ws_id: 'ws-yoola',
    id: 'audit-1',
    next_canonical_id: 'yoola-main',
    previous_canonical_id: null,
    source_ws_id: 'platform',
  },
] as any[];

const ROOT_ADMIN_INTERACTION_TIMEOUT_MS = 10_000;

function renderClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 0,
        retry: false,
      },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  return render(
    createElement(RootExternalProjectsAdminClient, {
      initialAudits: audits,
      initialBindings: bindings,
      initialProjects: templates,
    }),
    { wrapper }
  );
}

describe('RootExternalProjectsAdminClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    internalApiMocks.listCanonicalExternalProjects.mockResolvedValue(templates);
    internalApiMocks.listExternalProjectWorkspaceBindings.mockResolvedValue(
      bindings
    );
    internalApiMocks.listWorkspaceExternalProjectBindingAudits.mockResolvedValue(
      audits
    );
    internalApiMocks.updateWorkspaceExternalProjectBinding.mockResolvedValue({
      canonical_id: null,
      enabled: false,
    });
  });

  it(
    'filters site projects and opens the project details dialog',
    async () => {
      renderClient();

      expect(
        screen.getByRole('button', { name: /Yoola Studio/ })
      ).not.toBeNull();
      expect(screen.getByRole('button', { name: /Junly Shop/ })).not.toBeNull();

      fireEvent.change(
        screen.getByPlaceholderText(
          'Search project name, internal ID, template, or site type'
        ),
        {
          target: { value: 'junly' },
        }
      );

      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /Yoola Studio/ })
        ).toBeNull();
      });

      const junlyProjectButton = screen.getByRole('button', {
        name: /Junly Shop/,
      });
      fireEvent.click(junlyProjectButton);

      const dialog = await screen.findByRole('dialog');

      expect(within(dialog).getByText('Selected template')).not.toBeNull();
    },
    ROOT_ADMIN_INTERACTION_TIMEOUT_MS
  );

  it('saves a disconnected project connection from the details dialog', async () => {
    renderClient();

    fireEvent.click(screen.getByText('Yoola Studio').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save connection' }));

    await waitFor(() => {
      expect(
        internalApiMocks.updateWorkspaceExternalProjectBinding
      ).toHaveBeenCalledWith('ws-yoola', null);
    });
  });

  it('opens template management as a secondary dialog', () => {
    renderClient();

    fireEvent.click(screen.getByRole('button', { name: 'Manage templates' }));

    expect(screen.getByRole('dialog')).not.toBeNull();
    expect(screen.getByText('Template manager')).not.toBeNull();
    expect(screen.getByText('New site template')).not.toBeNull();
  });
});
