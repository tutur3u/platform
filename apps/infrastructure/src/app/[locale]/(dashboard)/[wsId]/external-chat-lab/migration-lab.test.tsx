import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalChatMigrationLab } from './migration-lab';

const mocks = vi.hoisted(() => ({
  getExternalChatBindingState: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getExternalChatBindingState: (...args: unknown[]) =>
    mocks.getExternalChatBindingState(...args),
}));

vi.mock('../ai-agents/workspace-picker', () => ({
  WorkspacePicker: ({
    onValueChange,
  }: {
    onValueChange: (value: string) => void;
  }) => (
    <button
      onClick={() => onValueChange('5f42ae0f-f447-4619-bab6-1d98496ab5ef')}
      type="button"
    >
      select destination
    </button>
  ),
}));

function renderLab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<ExternalChatMigrationLab wsId="root-workspace" />, {
    wrapper,
  });
}

describe('external chat migration lab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getExternalChatBindingState.mockResolvedValue({
      enabled: true,
      readiness: { errors: [], ready: true },
      secrets: {
        control: { configured: true },
        ingest: { configured: true },
      },
      settings: { authorityMode: 'mirror_verified' },
    });
  });

  it('waits for a destination and checks the selected workspace', async () => {
    renderLab();

    expect(screen.getByText('select_workspace')).toBeInTheDocument();
    expect(mocks.getExternalChatBindingState).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'select destination' }));

    await waitFor(() => {
      expect(mocks.getExternalChatBindingState).toHaveBeenCalledWith(
        '5f42ae0f-f447-4619-bab6-1d98496ab5ef'
      );
    });
  });
});
