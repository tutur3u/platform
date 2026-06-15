import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileDeploymentClient } from './mobile-deployment-client';

const mocks = vi.hoisted(() => ({
  activateMobileDeploymentDraft: vi.fn(),
  clearMobileDeploymentSecret: vi.fn(),
  getMobileDeploymentState: vi.fn(),
  issueMobileDeploymentCiToken: vi.fn(),
  revokeMobileDeploymentCiToken: vi.fn(),
  rollbackMobileDeploymentVersion: vi.fn(),
  saveMobileDeploymentSecret: vi.fn(),
  toast: vi.fn(),
  uploadMobileDeploymentFileResource: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/infrastructure', async () => {
  const actual = await vi.importActual<
    typeof import('@tuturuuu/internal-api/infrastructure')
  >('@tuturuuu/internal-api/infrastructure');

  return {
    ...actual,
    activateMobileDeploymentDraft: mocks.activateMobileDeploymentDraft,
    clearMobileDeploymentSecret: mocks.clearMobileDeploymentSecret,
    getMobileDeploymentState: mocks.getMobileDeploymentState,
    issueMobileDeploymentCiToken: mocks.issueMobileDeploymentCiToken,
    revokeMobileDeploymentCiToken: mocks.revokeMobileDeploymentCiToken,
    rollbackMobileDeploymentVersion: mocks.rollbackMobileDeploymentVersion,
    saveMobileDeploymentSecret: mocks.saveMobileDeploymentSecret,
    uploadMobileDeploymentFileResource:
      mocks.uploadMobileDeploymentFileResource,
  };
});

vi.mock('@tuturuuu/ui/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values?.value ? `${key} ${values.value}` : key,
}));

const baseState = {
  activeVersion: null,
  auditEvents: [],
  draftVersion: {
    activatedAt: null,
    createdAt: '2026-06-14T00:00:00.000Z',
    id: 'draft-1',
    readinessErrors: ['android_upload_keystore is missing'],
    ready: false,
    status: 'draft' as const,
    version: 1,
  },
  envKeys: [
    {
      configured: true,
      lastFour: '.com',
      name: 'API_BASE_URL',
      plaintextSha256: 'abcdef1234567890',
      size: 20,
      updatedAt: '2026-06-14T00:00:00.000Z',
      validationErrors: [],
    },
    {
      configured: true,
      lastFour: '1234',
      name: 'CUSTOM_API_KEY',
      plaintextSha256: '123456abcdef7890',
      size: 12,
      updatedAt: '2026-06-14T00:00:00.000Z',
      validationErrors: [],
    },
  ],
  fileArtifacts: [
    {
      configured: true,
      lastFour: null,
      name: 'android_google_services_json',
      plaintextSha256: '987654abcdef0000',
      size: 42,
      updatedAt: '2026-06-14T00:00:00.000Z',
      validationErrors: [],
    },
  ],
  scalarValues: [
    {
      configured: true,
      lastFour: 'load',
      name: 'ANDROID_KEYSTORE_ALIAS',
      plaintextSha256: 'fedcba6543210000',
      size: 6,
      updatedAt: '2026-06-14T00:00:00.000Z',
      validationErrors: [],
    },
  ],
  tokens: [],
};

function renderClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MobileDeploymentClient initialData={baseState} />
    </QueryClientProvider>
  );
}

describe('MobileDeploymentClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMobileDeploymentState.mockResolvedValue(baseState);
    mocks.saveMobileDeploymentSecret.mockResolvedValue(baseState);
    mocks.clearMobileDeploymentSecret.mockResolvedValue(baseState);
  });

  it('renders preset, custom, and built-in secret rows together', () => {
    renderClient();

    expect(screen.getByText('NEXT_PUBLIC_SUPABASE_URL')).toBeInTheDocument();
    expect(screen.getByText('CUSTOM_API_KEY')).toBeInTheDocument();
    expect(screen.getByText('ANDROID_KEYSTORE_ALIAS')).toBeInTheDocument();
    expect(
      screen.getByText('android_google_services_json')
    ).toBeInTheDocument();
    expect(screen.getByText('readinessIssues')).toBeInTheDocument();
  });

  it('adds custom secrets through the dialog', async () => {
    renderClient();

    fireEvent.click(screen.getByRole('button', { name: 'addSecret' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('name'), {
      target: { value: 'EXTRA_FLAG' },
    });
    fireEvent.change(within(dialog).getByLabelText('value'), {
      target: { value: 'enabled' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'save' }));

    await waitFor(() =>
      expect(mocks.saveMobileDeploymentSecret).toHaveBeenCalledWith({
        kind: 'env',
        name: 'EXTRA_FLAG',
        previousName: undefined,
        value: 'enabled',
      })
    );
  });

  it('submits custom secrets through the dialog form', async () => {
    renderClient();

    fireEvent.click(screen.getByRole('button', { name: 'addSecret' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('name'), {
      target: { value: 'EXTRA_FLAG' },
    });
    const valueInput = within(dialog).getByLabelText('value');
    fireEvent.change(valueInput, {
      target: { value: 'enabled' },
    });

    const form = valueInput.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    await waitFor(() =>
      expect(mocks.saveMobileDeploymentSecret).toHaveBeenCalledWith({
        kind: 'env',
        name: 'EXTRA_FLAG',
        previousName: undefined,
        value: 'enabled',
      })
    );
  });

  it('edits and clears built-in secrets through row actions', async () => {
    renderClient();

    const scalarRow = screen.getByTestId(
      'mobile-deployment-secret-row-ANDROID_KEYSTORE_ALIAS'
    );
    fireEvent.click(within(scalarRow).getByRole('button', { name: 'edit' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('value'), {
      target: { value: 'upload' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'save' }));

    await waitFor(() =>
      expect(mocks.saveMobileDeploymentSecret).toHaveBeenCalledWith({
        kind: 'scalar',
        name: 'ANDROID_KEYSTORE_ALIAS',
        value: 'upload',
      })
    );

    fireEvent.click(within(scalarRow).getByRole('button', { name: 'clear' }));
    await waitFor(() =>
      expect(mocks.clearMobileDeploymentSecret).toHaveBeenCalledWith({
        kind: 'scalar',
        name: 'ANDROID_KEYSTORE_ALIAS',
      })
    );
  });

  it('clears custom env keys and verifies readiness', async () => {
    renderClient();

    const envRow = screen.getByTestId(
      'mobile-deployment-secret-row-CUSTOM_API_KEY'
    );
    fireEvent.click(within(envRow).getByRole('button', { name: 'clear' }));
    await waitFor(() =>
      expect(mocks.clearMobileDeploymentSecret).toHaveBeenCalledWith({
        kind: 'env',
        name: 'CUSTOM_API_KEY',
      })
    );

    const callsBeforeVerify = mocks.getMobileDeploymentState.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'verify' }));
    await waitFor(() =>
      expect(mocks.getMobileDeploymentState.mock.calls.length).toBeGreaterThan(
        callsBeforeVerify
      )
    );
  });

  it('keeps the dialog open when saving fails', async () => {
    mocks.saveMobileDeploymentSecret.mockRejectedValueOnce(
      new Error('Forbidden')
    );
    renderClient();

    fireEvent.click(screen.getByRole('button', { name: 'addSecret' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('name'), {
      target: { value: 'EXTRA_FLAG' },
    });
    fireEvent.change(within(dialog).getByLabelText('value'), {
      target: { value: 'enabled' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'save' }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: 'Forbidden',
        variant: 'destructive',
      })
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Forbidden')).toBeInTheDocument();
  });
});
