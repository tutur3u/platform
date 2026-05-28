import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PasskeysSettings from './passkeys-settings';

const {
  mockDeletePasskey,
  mockListPasskeys,
  mockRegisterPasskey,
  mockToastError,
  mockToastSuccess,
  mockUpdatePasskey,
} = vi.hoisted(() => ({
  mockDeletePasskey: vi.fn(),
  mockListPasskeys: vi.fn(),
  mockRegisterPasskey: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockUpdatePasskey: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-browser', () => ({
  createAuthClient: () => ({
    auth: {
      registerPasskey: mockRegisterPasskey,
      passkey: {
        delete: mockDeletePasskey,
        list: mockListPasskeys,
        update: mockUpdatePasskey,
      },
    },
  }),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
  },
}));

vi.mock('@tuturuuu/icons', () => ({
  Check: () => <span data-testid="check-icon" />,
  Edit3: () => <span data-testid="edit-icon" />,
  Fingerprint: () => <span data-testid="passkey-icon" />,
  Plus: () => <span data-testid="plus-icon" />,
  Trash2: () => <span data-testid="trash-icon" />,
  X: () => <span data-testid="x-icon" />,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      'passkeys-add': 'Add passkey',
      'passkeys-delete': 'Delete passkey',
      'passkeys-empty-description':
        'Passkeys you add here will appear in this list.',
      'passkeys-empty-title': 'No passkeys yet',
      'passkeys-name-label': 'Passkey name',
      'passkeys-register-success': 'Passkey added',
      'passkeys-rename': 'Rename passkey',
      'passkeys-save': 'Save passkey name',
      'passkeys-update-success': 'Passkey updated',
      'passkeys-delete-success': 'Passkey deleted',
    };

    const message = translations[key] ?? key;
    if (!values) return message;

    return Object.entries(values).reduce(
      (current, [name, value]) => current.replace(`{${name}}`, String(value)),
      message
    );
  },
}));

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PasskeysSettings />
    </QueryClientProvider>
  );
}

describe('PasskeysSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPasskeys.mockResolvedValue({ data: [], error: null });
    mockRegisterPasskey.mockResolvedValue({ data: {}, error: null });
    mockUpdatePasskey.mockResolvedValue({ data: {}, error: null });
    mockDeletePasskey.mockResolvedValue({ data: null, error: null });
  });

  it('shows an empty state and can register a new passkey', async () => {
    renderPanel();

    expect(await screen.findByText('No passkeys yet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add passkey/i }));

    await waitFor(() => {
      expect(mockRegisterPasskey).toHaveBeenCalledTimes(1);
      expect(mockToastSuccess).toHaveBeenCalledWith('Passkey added');
    });
  });

  it('renames and deletes an existing passkey', async () => {
    mockListPasskeys.mockResolvedValue({
      data: [
        {
          created_at: '2026-05-28T10:00:00.000Z',
          friendly_name: 'MacBook Touch ID',
          id: 'passkey-1',
          last_used_at: '2026-05-28T11:00:00.000Z',
        },
      ],
      error: null,
    });

    renderPanel();

    expect(await screen.findByText('MacBook Touch ID')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /rename passkey/i }));
    const nameInput = screen.getByLabelText('Passkey name');
    fireEvent.change(nameInput, { target: { value: 'Work laptop' } });
    fireEvent.click(screen.getByRole('button', { name: /save passkey name/i }));

    await waitFor(() => {
      expect(mockUpdatePasskey).toHaveBeenCalledWith({
        friendlyName: 'Work laptop',
        passkeyId: 'passkey-1',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: /delete passkey/i }));

    await waitFor(() => {
      expect(mockDeletePasskey).toHaveBeenCalledWith({
        passkeyId: 'passkey-1',
      });
    });
  });
});
