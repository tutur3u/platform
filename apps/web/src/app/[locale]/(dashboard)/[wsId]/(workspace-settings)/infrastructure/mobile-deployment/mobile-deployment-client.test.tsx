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
  clearMobileDeploymentEnvKeyValue: vi.fn(),
  clearMobileDeploymentScalarValue: vi.fn(),
  getMobileDeploymentState: vi.fn(),
  issueMobileDeploymentCiToken: vi.fn(),
  revokeMobileDeploymentCiToken: vi.fn(),
  rollbackMobileDeploymentVersion: vi.fn(),
  saveMobileDeploymentEnvKeyValue: vi.fn(),
  saveMobileDeploymentScalarValue: vi.fn(),
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
    clearMobileDeploymentEnvKeyValue: mocks.clearMobileDeploymentEnvKeyValue,
    clearMobileDeploymentScalarValue: mocks.clearMobileDeploymentScalarValue,
    getMobileDeploymentState: mocks.getMobileDeploymentState,
    issueMobileDeploymentCiToken: mocks.issueMobileDeploymentCiToken,
    revokeMobileDeploymentCiToken: mocks.revokeMobileDeploymentCiToken,
    rollbackMobileDeploymentVersion: mocks.rollbackMobileDeploymentVersion,
    saveMobileDeploymentEnvKeyValue: mocks.saveMobileDeploymentEnvKeyValue,
    saveMobileDeploymentScalarValue: mocks.saveMobileDeploymentScalarValue,
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
  fileArtifacts: [],
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
    mocks.saveMobileDeploymentEnvKeyValue.mockResolvedValue(baseState);
    mocks.clearMobileDeploymentEnvKeyValue.mockResolvedValue(baseState);
    mocks.saveMobileDeploymentScalarValue.mockResolvedValue(baseState);
    mocks.clearMobileDeploymentScalarValue.mockResolvedValue(baseState);
  });

  it('renders preset and custom env rows with scalar rows', () => {
    renderClient();

    expect(screen.getByText('NEXT_PUBLIC_SUPABASE_URL')).toBeInTheDocument();
    expect(screen.getByText('CUSTOM_API_KEY')).toBeInTheDocument();
    expect(screen.getByText('ANDROID_KEYSTORE_ALIAS')).toBeInTheDocument();
  });

  it('adds env keys through the dialog', async () => {
    renderClient();

    fireEvent.click(screen.getByRole('button', { name: 'addKey' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('name'), {
      target: { value: 'EXTRA_FLAG' },
    });
    fireEvent.change(within(dialog).getByLabelText('value'), {
      target: { value: 'enabled' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'save' }));

    await waitFor(() =>
      expect(mocks.saveMobileDeploymentEnvKeyValue).toHaveBeenCalledWith(
        'EXTRA_FLAG',
        'enabled'
      )
    );
  });

  it('edits and clears scalar keys through row actions', async () => {
    renderClient();

    const scalarRow = screen.getByTestId(
      'mobile-deployment-scalar-row-ANDROID_KEYSTORE_ALIAS'
    );
    fireEvent.click(within(scalarRow).getByRole('button', { name: 'edit' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('value'), {
      target: { value: 'upload' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'save' }));

    await waitFor(() =>
      expect(mocks.saveMobileDeploymentScalarValue).toHaveBeenCalledWith(
        'ANDROID_KEYSTORE_ALIAS',
        'upload'
      )
    );

    fireEvent.click(within(scalarRow).getByRole('button', { name: 'clear' }));
    await waitFor(() =>
      expect(mocks.clearMobileDeploymentScalarValue).toHaveBeenCalledWith(
        'ANDROID_KEYSTORE_ALIAS'
      )
    );
  });

  it('clears custom env keys and verifies readiness', async () => {
    renderClient();

    const envRow = screen.getByTestId(
      'mobile-deployment-env-row-CUSTOM_API_KEY'
    );
    fireEvent.click(within(envRow).getByRole('button', { name: 'clear' }));
    await waitFor(() =>
      expect(mocks.clearMobileDeploymentEnvKeyValue).toHaveBeenCalledWith(
        'CUSTOM_API_KEY'
      )
    );

    const callsBeforeVerify = mocks.getMobileDeploymentState.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'verify' }));
    await waitFor(() =>
      expect(mocks.getMobileDeploymentState.mock.calls.length).toBeGreaterThan(
        callsBeforeVerify
      )
    );
  });
});
