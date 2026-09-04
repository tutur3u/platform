// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateWorkspaceConfig = vi.fn();
const refresh = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  ENABLE_TUTORING_CONFIG_ID: 'ENABLE_TUTORING',
  updateWorkspaceConfig: (...args: unknown[]) =>
    updateWorkspaceConfig(...args) as unknown,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

import {
  TutoringDisabledGate,
  TutoringForbiddenGate,
  TutoringUnavailableGate,
} from './tutoring-gate';

function withQueryClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('TutoringDisabledGate', () => {
  beforeEach(() => {
    updateWorkspaceConfig.mockReset();
    refresh.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it('lets an admin turn tutoring on from the page that used to 404', async () => {
    updateWorkspaceConfig.mockResolvedValue({ message: 'success' });

    render(withQueryClient(<TutoringDisabledGate canEnable wsId="personal" />));

    expect(
      screen.getByText('ws-tutoring.feature_disabled_description')
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'ws-tutoring.enable_feature' })
    );

    await waitFor(() =>
      expect(updateWorkspaceConfig).toHaveBeenCalledWith(
        'personal',
        'ENABLE_TUTORING',
        'true'
      )
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(toastSuccess).toHaveBeenCalledWith('ws-tutoring.feature_enabled');
  });

  it('surfaces a failed enable instead of silently staying disabled', async () => {
    updateWorkspaceConfig.mockRejectedValue(new Error('Forbidden'));

    render(withQueryClient(<TutoringDisabledGate canEnable wsId="ws-1" />));
    fireEvent.click(
      screen.getByRole('button', { name: 'ws-tutoring.enable_feature' })
    );

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Forbidden'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('tells a member who to ask instead of offering a button they cannot use', () => {
    render(
      withQueryClient(<TutoringDisabledGate canEnable={false} wsId="ws-1" />)
    );

    expect(
      screen.getByText('ws-tutoring.feature_disabled_description_member')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ws-tutoring.enable_feature' })
    ).not.toBeInTheDocument();
  });
});

describe('permission and workspace gates', () => {
  it('explains a permission denial', () => {
    render(withQueryClient(<TutoringForbiddenGate />));

    expect(screen.getByText('ws-tutoring.no_access_title')).toBeInTheDocument();
  });

  it('offers a retry when the workspace profile could not be resolved', () => {
    refresh.mockReset();
    render(withQueryClient(<TutoringUnavailableGate />));

    fireEvent.click(
      screen.getByRole('button', { name: 'workspace-feature-gate.retry' })
    );
    expect(refresh).toHaveBeenCalledOnce();
  });
});
