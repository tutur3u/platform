import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  create: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  actor: { actorId: 'actor', assertActive: vi.fn() },
}));
vi.mock('@tuturuuu/internal-api/calendar-series', () => ({
  createNativeCalendarSeries: mock.create,
  getNativeCalendarSeries: mock.read,
  mutateNativeCalendarSeries: mock.mutate,
}));
vi.mock('../../../../hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => mock.actor,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { NativeRecurrenceDialog } from './native-recurrence-dialog';

const series = {
  id: 'series',
  ws_id: 'ws',
  revision: 4,
  workspace_calendar_id: null,
  rule: {
    version: 1,
    frequency: 'daily',
    interval: 1,
    timeZone: 'UTC',
    end: { type: 'never' },
  },
  anchor: {
    startLocal: '2026-10-05T09:00:00',
    endLocal: '2026-10-05T10:00:00',
    allDay: false,
  },
  payload: { title: 'Daily' },
  exceptions: [],
};
const occurrence = {
  id: 'event',
  ws_id: 'ws',
  seriesId: 'series',
  seriesRevision: 2,
  originalStartLocal: '2026-10-06T09:00:00',
  start_at: '2026-10-06T09:00:00Z',
  end_at: '2026-10-06T10:00:00Z',
  title: 'Occurrence',
};
function setup(
  props: Partial<Parameters<typeof NativeRecurrenceDialog>[0]> = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const close = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <NativeRecurrenceDialog
        wsId="ws"
        timezone="UTC"
        open
        onOpenChange={close}
        {...props}
      />
    </QueryClientProvider>
  );
  return { ...view, close, client };
}
beforeEach(() => {
  vi.resetAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  mock.actor.actorId = 'actor';
  mock.create.mockResolvedValue(series);
  mock.read.mockResolvedValue(series);
  mock.mutate.mockResolvedValue(series);
});
describe('native recurrence form interactions', () => {
  it('creates through the series API and closes only after success', async () => {
    const { close } = setup();
    fireEvent.change(screen.getByLabelText('title'), {
      target: { value: 'Planning' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(1));
    expect(mock.create.mock.calls[0]?.[0]).toBe('ws');
    expect(mock.create.mock.calls[0]?.[1]).toMatchObject({
      event: { title: 'Planning' },
      rule: { version: 1, frequency: 'weekly', timeZone: 'UTC' },
      requestId: expect.any(String),
    });
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  });
  it('retains the draft and request ID after transport failure for an idempotent retry', async () => {
    mock.create.mockRejectedValueOnce(new InternalApiError('failed', 503));
    const { close } = setup();
    fireEvent.change(screen.getByLabelText('title'), {
      target: { value: 'Planning' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await screen.findByRole('alert');
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByLabelText('title')).toHaveValue('Planning');
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => expect(mock.create).toHaveBeenCalledTimes(2));
    expect(mock.create.mock.calls[1]?.[1].requestId).toBe(
      mock.create.mock.calls[0]?.[1].requestId
    );
  });
  it('rejects an invalid form before sending a mutation', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('title'), {
      target: { value: 'Planning' },
    });
    fireEvent.change(screen.getByLabelText('interval'), {
      target: { value: '0' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'save' }).closest('form')!
    );
    expect(screen.getByRole('alert')).toHaveTextContent('invalid');
    expect(mock.create).not.toHaveBeenCalled();
  });
  it('disables writes in a read-only calendar', () => {
    setup({ readOnly: true });
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();
    expect(screen.getByLabelText('title')).toBeDisabled();
    expect(mock.create).not.toHaveBeenCalled();
  });
  it('fences writes when the verified account scope changed', () => {
    mock.actor.assertActive.mockImplementation(() => {
      throw new Error('actor changed');
    });
    setup();
    fireEvent.change(screen.getByLabelText('title'), {
      target: { value: 'Planning' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('invalid');
    expect(mock.create).not.toHaveBeenCalled();
  });
  it('edits a virtual occurrence using the loaded series revision and immutable original slot', async () => {
    setup({ occurrence });
    const title = await screen.findByLabelText('title');
    fireEvent.change(title, { target: { value: 'New title' } });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => expect(mock.mutate).toHaveBeenCalledTimes(1));
    expect(mock.mutate.mock.calls[0]?.slice(0, 2)).toEqual(['ws', 'series']);
    expect(mock.mutate.mock.calls[0]?.[2]).toMatchObject({
      scope: 'this',
      expectedRevision: 4,
      originalStartLocal: '2026-10-06T09:00:00',
      event: { title: 'New title' },
    });
    expect(mock.mutate.mock.calls[0]?.[2].rule).toBeUndefined();
    expect(mock.create).not.toHaveBeenCalled();
  });
  it.each(['all', 'future'] as const)(
    'saves the selected %s scope with its original slot and recurrence rule',
    async (scope) => {
      setup({ occurrence });
      await screen.findByLabelText('title');
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'scope' }), {
        key: 'ArrowDown',
      });
      expect(
        screen.queryByText('futureExceptionsReset')
      ).not.toBeInTheDocument();
      fireEvent.click(await screen.findByRole('option', { name: scope }));
      if (scope === 'future') {
        expect(screen.getByText('futureExceptionsReset')).toBeVisible();
      } else {
        expect(
          screen.queryByText('futureExceptionsReset')
        ).not.toBeInTheDocument();
      }
      fireEvent.click(screen.getByRole('button', { name: 'save' }));
      await waitFor(() => expect(mock.mutate).toHaveBeenCalledTimes(1));
      expect(mock.mutate.mock.calls[0]?.[2]).toMatchObject({
        scope,
        expectedRevision: 4,
        originalStartLocal: occurrence.originalStartLocal,
        rule: { frequency: 'daily' },
        anchor: {
          startLocal:
            scope === 'all'
              ? series.anchor.startLocal
              : occurrence.originalStartLocal,
        },
      });
    }
  );
  it('omits the tail-reset notice when the first occurrence becomes a whole-series edit', async () => {
    setup({
      occurrence: {
        ...occurrence,
        originalStartLocal: series.anchor.startLocal,
      },
    });
    await screen.findByLabelText('title');
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'scope' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(await screen.findByRole('option', { name: 'future' }));
    expect(screen.queryByText('futureExceptionsReset')).not.toBeInTheDocument();
  });
  it('keeps permission failures visible without closing or pretending a save succeeded', async () => {
    mock.mutate.mockRejectedValue(new InternalApiError('denied', 403));
    const { close } = setup({ occurrence });
    await screen.findByLabelText('title');
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await screen.findByRole('alert');
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByLabelText('title')).toHaveValue('Occurrence');
  });
  it('resets draft and retry identity when reopened in a different workspace', async () => {
    const { rerender, client, close } = setup();
    fireEvent.change(screen.getByLabelText('title'), {
      target: { value: 'Private draft' },
    });
    rerender(
      <QueryClientProvider client={client}>
        <NativeRecurrenceDialog
          wsId="other"
          timezone="UTC"
          open
          onOpenChange={close}
        />
      </QueryClientProvider>
    );
    expect(screen.getByLabelText('title')).toHaveValue('');
  });
});
