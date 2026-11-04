import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../messages/en.json';
import vi_ from '../../../../../messages/vi.json';
import {
  isBlockingDeliveryCategory,
  periodicDeliveryCategory,
} from './periodic-delivery-category';
import { PeriodicHeldReports } from './periodic-held-reports';

// Synthetic workspace and classes only. The held API is mocked: nothing here
// can count, queue, skip or send a real report.
const api = vi.hoisted(() => ({
  preview: vi.fn(),
  resolve: vi.fn(),
  groups: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/internal-api/reports')>()),
  previewHeldPeriodicReports: api.preview,
  resolveHeldPeriodicReports: api.resolve,
  listWorkspaceReportGroups: api.groups,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast }));

beforeEach(() => {
  vi.clearAllMocks();
  api.preview.mockResolvedValue({ count: 2, sendLimit: 100, skipLimit: 1000 });
  api.resolve.mockImplementation(async (_ws, payload) => ({
    action: payload.action,
    requested: payload.expectedCount,
    affected: payload.expectedCount,
    replayed: false,
  }));
  api.groups.mockResolvedValue({
    groups: [{ id: 'class-a', name: 'Class A' }],
    groupStatusSummary: [],
    hasMore: false,
    selectedGroup: null,
    selectedGroupManagers: [],
  });
});

function show({
  heldCount = 2,
  canResolve = true,
}: {
  heldCount?: number;
  canResolve?: boolean;
} = {}) {
  const resolved = vi.fn();
  const review = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={en}>
        <PeriodicHeldReports
          wsId="workspace-a"
          heldCount={heldCount}
          canResolve={canResolve}
          cadence="monthly"
          periodStart="2026-09-01"
          periodEnd="2026-09-30"
          onReview={review}
          onResolved={resolved}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return { resolved, review };
}

describe('approved, not sent group', () => {
  it('is hidden when nothing is held', () => {
    show({ heldCount: 0 });
    expect(screen.queryByText('Approved, not sent')).toBeNull();
  });

  it('shows the count to everyone but the actions only to admins', () => {
    const { review } = show({ canResolve: false });
    expect(screen.getByText('Approved, not sent')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Send now/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Skip/ })).toBeNull();
    expect(screen.getByText(/Only an administrator/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show these reports' }));
    expect(review).toHaveBeenCalledOnce();
    expect(api.preview).not.toHaveBeenCalled();
  });

  it('confirms the exact server count before Send now, and sends once on a double click', async () => {
    const { resolved } = show();
    fireEvent.click(screen.getByRole('button', { name: /Send now/ }));
    expect(
      await screen.findByText('2 approved, unsent reports match this scope.')
    ).toBeTruthy();
    expect(api.preview).toHaveBeenCalledWith('workspace-a', {
      cadence: 'monthly',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      groupId: undefined,
      timezone: expect.any(String),
    });
    const confirm = screen.getByRole('button', { name: 'Send 2 reports now' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(resolved).toHaveBeenCalled());
    expect(api.resolve).toHaveBeenCalledOnce();
    expect(api.resolve).toHaveBeenCalledWith(
      'workspace-a',
      expect.objectContaining({
        action: 'send',
        cadence: 'monthly',
        periodStart: '2026-09-01',
        periodEnd: '2026-09-30',
        expectedCount: 2,
        idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      })
    );
    expect(toast.success).toHaveBeenCalledWith(
      '2 reports queued for delivery.'
    );
  });

  it('records Skip with its own confirmation', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Skip 2 reports' })
    );
    await waitFor(() => expect(api.resolve).toHaveBeenCalledOnce());
    expect(api.resolve.mock.lastCall?.[1]).toMatchObject({
      action: 'skip',
      expectedCount: 2,
    });
    expect(toast.success).toHaveBeenCalledWith('2 reports marked as not sent.');
  });

  it('cannot confirm above the per-action cap', async () => {
    api.preview.mockResolvedValue({
      count: 101,
      sendLimit: 100,
      skipLimit: 1000,
    });
    show();
    fireEvent.click(screen.getByRole('button', { name: /Send now/ }));
    expect(await screen.findByText(/at most 100 can be handled/)).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Send 101 reports now',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it('recounts with a new confirmation key when the held set changed', async () => {
    api.resolve.mockRejectedValueOnce(
      new InternalApiError('changed', 409, 'HELD_SCOPE_CHANGED')
    );
    show();
    fireEvent.click(screen.getByRole('button', { name: /Send now/ }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Send 2 reports now' })
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'These reports changed. Review the new count and confirm again.'
      )
    );
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(2));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Send 2 reports now' })
    );
    await waitFor(() => expect(api.resolve).toHaveBeenCalledTimes(2));
    const [first, second] = api.resolve.mock.calls.map(
      ([, payload]) => payload.idempotencyKey
    );
    expect(second).not.toBe(first);
  });

  it('keeps the confirmation key after a lost response, so a retry replays instead of sending again', async () => {
    api.resolve.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    show();
    fireEvent.click(screen.getByRole('button', { name: /Send now/ }));
    const confirm = await screen.findByRole('button', {
      name: 'Send 2 reports now',
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'Send 2 reports now',
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false)
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send 2 reports now' }));
    await waitFor(() => expect(api.resolve).toHaveBeenCalledTimes(2));
    const [first, second] = api.resolve.mock.calls.map(
      ([, payload]) => payload.idempotencyKey
    );
    expect(second).toBe(first);
  });
});

describe('held delivery category', () => {
  const held = {
    report_stage: 'approved',
    report_approval_status: 'APPROVED',
    generation_status: 'ready',
    delivery_status: 'draft',
    user_email: 'learner@example.com',
    last_delivery_error: null,
  } as Parameters<typeof periodicDeliveryCategory>[0];

  it('classifies approved, never-requested reports as held', () => {
    expect(periodicDeliveryCategory(held)).toBe('held');
    expect(
      periodicDeliveryCategory({
        ...held,
        delivery_status: 'queued',
        report_stage: 'queued',
      })
    ).toBeNull();
    expect(periodicDeliveryCategory({ ...held, user_email: null })).toBe(
      'missing_email'
    );
  });

  it('keeps manual Send for held reports: held is not a blocker', () => {
    expect(isBlockingDeliveryCategory('held')).toBe(false);
    expect(isBlockingDeliveryCategory(null)).toBe(false);
    expect(isBlockingDeliveryCategory('failure')).toBe(true);
  });

  it('has every held string in English and Vietnamese', () => {
    const keys = (messages: typeof en) =>
      Object.keys(messages['reports-hub']).filter(
        (key) => key.startsWith('held_') || key.startsWith('category_held')
      );
    expect(keys(en).length).toBeGreaterThan(20);
    expect(keys(vi_ as typeof en)).toEqual(keys(en));
    expect(vi_['reports-hub'].held_title).toBe('Đã duyệt, chưa gửi');
  });
});
