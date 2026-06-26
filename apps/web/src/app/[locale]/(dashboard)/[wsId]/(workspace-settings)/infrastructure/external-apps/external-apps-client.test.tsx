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
import { ExternalAppsClient } from './external-apps-client';

const mocks = vi.hoisted(() => ({
  listExternalApps: vi.fn(),
  rotateExternalAppSecret: vi.fn(),
  saveExternalApp: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/infrastructure/apps', () => ({
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

  return render(<ExternalAppsClient initialApps={[workspaceApp]} />, {
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

  it('offers workspace and profile scopes as registration presets', () => {
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
});
