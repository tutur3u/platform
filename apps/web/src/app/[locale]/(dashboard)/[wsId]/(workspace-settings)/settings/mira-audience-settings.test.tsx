// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  getMiraAudienceAttestation: mocks.get,
  updateMiraAudienceAttestation: mocks.update,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ dateTime: () => 'synthetic-date' }),
}));

import { MiraAudienceSettings } from '@tuturuuu/ui/custom/mira-audience-settings';

const WS = '00000000-0000-4000-8000-000000000011';
const off = { attested: false, attestedAt: null, attestedByCurrentUser: false };
const on = {
  attested: true,
  attestedAt: '2026-11-20T00:00:00Z',
  attestedByCurrentUser: true,
};

function view() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <MiraAudienceSettings wsId={WS} />
    </QueryClientProvider>
  );
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => document.body.replaceChildren());

it('asks for confirmation before attesting and saves only on confirm', async () => {
  mocks.get.mockResolvedValue(off);
  mocks.update.mockResolvedValue(on);
  view();
  const toggle = await screen.findByRole('switch');
  await waitFor(() => expect(toggle).not.toBeDisabled());
  fireEvent.click(toggle);
  expect(mocks.update).not.toHaveBeenCalled();
  fireEvent.click(
    await screen.findByRole('button', { name: 'mira_audience_confirm' })
  );
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(WS, true));
  await screen.findByText('mira_audience_attested_at');
  expect(mocks.success).toHaveBeenCalled();
});

it('withdraws immediately and shows a retry when loading fails', async () => {
  mocks.get.mockResolvedValue(on);
  mocks.update.mockResolvedValue(off);
  view();
  const toggle = await screen.findByRole('switch');
  await waitFor(() => expect(toggle).toBeChecked());
  fireEvent.click(toggle);
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(WS, false));
  expect(screen.queryByRole('alertdialog')).toBeNull();

  document.body.replaceChildren();
  mocks.get.mockRejectedValue(new Error('synthetic'));
  view();
  await screen.findByText('mira_audience_load_failed');
  expect(screen.getByRole('button', { name: 'retry' })).toBeTruthy();
});
