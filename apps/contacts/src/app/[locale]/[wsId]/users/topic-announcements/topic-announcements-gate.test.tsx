// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateWorkspaceFeatureSecret = vi.fn();
const refresh = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  updateWorkspaceFeatureSecret: (...args: unknown[]) =>
    updateWorkspaceFeatureSecret(...args) as unknown,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

import {
  TopicAnnouncementsDisabledGate,
  TopicAnnouncementsForbiddenGate,
} from './topic-announcements-gate';

function withQueryClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('TopicAnnouncementsDisabledGate', () => {
  beforeEach(() => {
    updateWorkspaceFeatureSecret.mockReset();
    refresh.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  it('writes the workspace secret that used to be settable only in platform settings', async () => {
    updateWorkspaceFeatureSecret.mockResolvedValue({ message: 'success' });

    render(
      withQueryClient(<TopicAnnouncementsDisabledGate canEnable wsId="ws-1" />)
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-topic-announcements-gate.enable_feature',
      })
    );

    await waitFor(() =>
      expect(updateWorkspaceFeatureSecret).toHaveBeenCalledWith(
        'ws-1',
        'ENABLE_TOPIC_ANNOUNCEMENTS',
        true
      )
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it('surfaces a rejected enable instead of silently staying disabled', async () => {
    updateWorkspaceFeatureSecret.mockRejectedValue(
      new Error('Insufficient permissions to update workspace secret')
    );

    render(
      withQueryClient(<TopicAnnouncementsDisabledGate canEnable wsId="ws-1" />)
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-topic-announcements-gate.enable_feature',
      })
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Insufficient permissions to update workspace secret'
      )
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('points a member at the secret owner rather than offering a dead button', () => {
    render(
      withQueryClient(
        <TopicAnnouncementsDisabledGate canEnable={false} wsId="ws-1" />
      )
    );

    expect(
      screen.getByText(
        'ws-topic-announcements-gate.disabled_description_member'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'ws-topic-announcements-gate.enable_feature',
      })
    ).not.toBeInTheDocument();
  });

  it('explains a permission denial', () => {
    render(withQueryClient(<TopicAnnouncementsForbiddenGate />));

    expect(
      screen.getByText('ws-topic-announcements-gate.no_access_title')
    ).toBeInTheDocument();
  });
});
