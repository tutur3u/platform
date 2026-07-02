import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalAppApprovalClient } from './external-app-approval-client';
import { ExternalAppsClient } from './external-apps-client';

const mocks = vi.hoisted(() => ({
  approveExternalAppManagedCron: vi.fn(),
  listExternalApps: vi.fn(),
  rotateExternalAppSecret: vi.fn(),
  saveExternalApp: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/infrastructure/apps', () => ({
  approveExternalAppManagedCron: mocks.approveExternalAppManagedCron,
  listExternalApps: mocks.listExternalApps,
  rotateExternalAppSecret: mocks.rotateExternalAppSecret,
  saveExternalApp: mocks.saveExternalApp,
}));

vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: ({
    options,
    selected,
  }: {
    options?: Array<{ label: string; value: string }>;
    selected?: string[];
  }) => (
    <div
      data-options={options?.map((option) => option.value).join(', ')}
      data-testid="scope-combobox"
    >
      {selected?.join(', ')}
    </div>
  ),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) => {
      const messages: Record<string, string> = {
        'actions.collapse': 'Collapse {app}',
        'actions.approve_setup': 'Approve setup',
        'actions.approve_scopes': 'Approve scopes',
        'actions.create': 'Create app',
        'actions.expand': 'Expand {app}',
        'actions.rotate_secret': 'Rotate secret',
        'actions.save': 'Save',
        'fields.app_id': 'App ID',
        'fields.display_name': 'Display name',
        'fields.enabled': 'Enabled',
        'fields.issue_secret': 'Issue secret now',
        'fields.origins': 'Allowed origins',
        'fields.scopes': 'Allowed API scopes',
        'fields.scopes_create': 'Add custom scope',
        'fields.scopes_empty': 'No scopes found.',
        'fields.scopes_placeholder': 'Select scopes',
        'fields.scopes_search': 'Search scopes',
        'fields.workspace_ids': 'Allowed workspace IDs',
        'messages.save_success': 'External app saved',
        'new_app.title': 'New external app',
        'approval.already_allowed': 'Already allowed',
        'approval.approved': 'Approved',
        'approval.approved_setup': 'Setup approved',
        'approval.description': 'Review requested scopes for {app}.',
        'approval.invalid_scopes': 'Invalid scopes',
        'approval.missing_app': 'External app not found.',
        'approval.missing_managed_cron_domain':
          'Managed scheduler domain approval',
        'approval.missing_origins': 'Missing origins',
        'approval.missing_scopes': 'Missing scopes',
        'approval.missing_workspaces': 'Missing workspace bindings',
        'approval.no_missing_scopes': 'No missing scopes',
        'approval.ready_to_approve': 'Ready to approve',
        'approval.requested_scopes': 'Requested scopes',
        'approval.return': 'Return to app',
        'approval.setup_success': 'Setup approved',
        'approval.success': 'Scopes approved',
        'approval.title': 'Approve external app scopes',
        'registered.empty': 'No external apps registered yet.',
        'registered.title': 'Registered apps',
        'secret.copy': 'Copy',
        'secret.copy_success': 'Secret copied',
        'secret.description': 'Store this secret for {appId}.',
        'secret.dismiss': 'Dismiss',
        'secret.title': 'One-time app secret',
        'secret.value_label': 'Generated app secret',
        'status.disabled': 'Disabled',
        'status.enabled': 'Enabled',
        'summary.last_secret': 'Last secret',
        'summary.no_secret': 'Not issued',
        'summary.origins': 'Origins',
        'summary.scopes': 'Scopes',
        'summary.secret_suffix': 'Ends in {suffix}',
        'summary.workspaces': 'Workspaces',
      };
      return (messages[key] ?? key).replace(/\{(\w+)\}/gu, (_, name) =>
        String(values?.[name] ?? '')
      );
    },
}));

const workspaceApp = {
  allowedScopes: ['workspace:session'],
  allowedWorkspaceIds: ['449cdd3b-121b-40f7-9cee-28f5b582e204'],
  createdAt: null,
  createdBy: null,
  displayName: 'Workspace App',
  enabled: true,
  id: 'workspace-app',
  origins: ['https://workspace.example.com'],
  secretIssuedAt: null,
  secretLastFour: '70Kc',
  updatedAt: '2026-06-26T00:00:00.000Z',
  updatedBy: null,
};

function renderClient() {
  return renderWithQuery(<ExternalAppsClient initialApps={[workspaceApp]} />);
}

function renderWithQuery(node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 0,
        retry: false,
      },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return render(node, {
    wrapper,
  });
}

describe('ExternalAppsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listExternalApps.mockResolvedValue({ apps: [workspaceApp] });
    mocks.saveExternalApp.mockResolvedValue({
      app: workspaceApp,
      secret: null,
    });
    mocks.approveExternalAppManagedCron.mockResolvedValue({
      domain: 'workspace.example.com',
      enabled: true,
    });
  });

  it('renders registered apps collapsed until expanded', () => {
    renderClient();

    const card = screen.getByTestId('external-app-card-workspace-app');

    expect(within(card).getByText('Workspace App')).toBeInTheDocument();
    expect(within(card).getByText('workspace-app')).toBeInTheDocument();
    expect(within(card).queryByDisplayValue('Workspace App')).toBeNull();

    fireEvent.click(
      within(card).getByRole('button', { name: 'Expand Workspace App' })
    );

    expect(within(card).getByDisplayValue('Workspace App')).toBeInTheDocument();
  });

  it('offers workspace, member, role, and profile scopes as registration presets', () => {
    renderClient();

    const card = screen.getByTestId('external-app-card-workspace-app');
    fireEvent.click(
      within(card).getByRole('button', { name: 'Expand Workspace App' })
    );

    const scopeOptions = screen
      .getAllByTestId('scope-combobox')
      .map((node) => node.getAttribute('data-options'));

    expect(
      scopeOptions.some((value) => value?.includes('workspace:session'))
    ).toBe(true);
    expect(
      scopeOptions.some((value) => value?.includes('workspace:members:read'))
    ).toBe(true);
    expect(
      scopeOptions.some((value) => value?.includes('workspace:members:write'))
    ).toBe(true);
    expect(
      scopeOptions.some((value) => value?.includes('workspace:roles:read'))
    ).toBe(true);
    expect(
      scopeOptions.some((value) => value?.includes('workspace:roles:write'))
    ).toBe(true);
    expect(
      scopeOptions.some((value) => value?.includes('workspace:cron:read'))
    ).toBe(true);
    expect(
      scopeOptions.some((value) => value?.includes('workspace:cron:write'))
    ).toBe(true);
    expect(
      scopeOptions.some((value) => value?.includes('users:profile:read'))
    ).toBe(true);
    expect(
      scopeOptions.some((value) => value?.includes('users:profile:write'))
    ).toBe(true);
  });

  it('disables save for clean registered apps and enables it when dirty', async () => {
    renderClient();

    const card = screen.getByTestId('external-app-card-workspace-app');
    fireEvent.click(
      within(card).getByRole('button', { name: 'Expand Workspace App' })
    );

    const saveButton = within(card).getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();

    fireEvent.change(within(card).getByLabelText('Display name'), {
      target: { value: 'Workspace App Updated' },
    });

    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mocks.saveExternalApp).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Workspace App Updated',
          id: 'workspace-app',
        })
      );
    });
  });

  it('approves missing external app scopes through the existing save API', async () => {
    renderWithQuery(
      <ExternalAppApprovalClient
        app={workspaceApp}
        cronDomainApproved={true}
        invalidScopes={[]}
        requestedOrigin={null}
        requestedScopes={[
          'workspace:session',
          'workspace:members:read',
          'workspace:members:write',
          'workspace:roles:read',
          'workspace:roles:write',
          'workspace:cron:read',
          'workspace:cron:write',
          'users:profile:read',
          'users:profile:write',
        ]}
        requestedWorkspaceId={null}
        returnUrl={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve scopes' }));

    await waitFor(() => {
      expect(mocks.saveExternalApp).toHaveBeenCalledWith({
        allowedScopes: [
          'users:profile:read',
          'users:profile:write',
          'workspace:cron:read',
          'workspace:cron:write',
          'workspace:members:read',
          'workspace:members:write',
          'workspace:roles:read',
          'workspace:roles:write',
          'workspace:session',
        ],
        allowedWorkspaceIds: ['449cdd3b-121b-40f7-9cee-28f5b582e204'],
        displayName: 'Workspace App',
        enabled: true,
        id: 'workspace-app',
        issueSecret: false,
        origins: ['https://workspace.example.com'],
      });
    });
  });

  it('approves managed scheduler domains without rewriting the app registration', async () => {
    renderWithQuery(
      <ExternalAppApprovalClient
        app={workspaceApp}
        cronDomainApproved={false}
        invalidScopes={[]}
        requestedOrigin="https://workspace.example.com"
        requestedScopes={['workspace:session']}
        requestedWorkspaceId={null}
        returnUrl={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve setup' }));

    await waitFor(() => {
      expect(mocks.approveExternalAppManagedCron).toHaveBeenCalledWith({
        origin: 'https://workspace.example.com',
      });
    });
    expect(mocks.saveExternalApp).not.toHaveBeenCalled();
  });

  it('merges missing registration access before approving the managed scheduler domain', async () => {
    renderWithQuery(
      <ExternalAppApprovalClient
        app={workspaceApp}
        cronDomainApproved={false}
        invalidScopes={[]}
        requestedOrigin="https://new-workspace.example.com"
        requestedScopes={['workspace:session', 'workspace:cron:read']}
        requestedWorkspaceId="workspace-2"
        returnUrl={null}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve setup' }));

    await waitFor(() => {
      expect(mocks.saveExternalApp).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedScopes: ['workspace:cron:read', 'workspace:session'],
          allowedWorkspaceIds: [
            '449cdd3b-121b-40f7-9cee-28f5b582e204',
            'workspace-2',
          ],
          issueSecret: false,
          origins: [
            'https://new-workspace.example.com',
            'https://workspace.example.com',
          ],
        })
      );
      expect(mocks.approveExternalAppManagedCron).toHaveBeenCalledWith({
        origin: 'https://new-workspace.example.com',
      });
    });
  });
});
