import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSeries: vi.fn(),
  nativeMutate: vi.fn(),
  nativeCreate: vi.fn(),
  capabilities: vi.fn(),
  providerSubmit: vi.fn(),
  pending: false,
  applied: (() => {}) as () => void,
}));
vi.mock('@tuturuuu/internal-api/calendar-series', () => ({
  getNativeCalendarSeries: mocks.getSeries,
  mutateNativeCalendarSeries: mocks.nativeMutate,
  createNativeCalendarSeries: mocks.nativeCreate,
}));
vi.mock('@tuturuuu/internal-api/calendar-provider-series', () => ({
  getCalendarProviderSeriesCapabilities: mocks.capabilities,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../../../../hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => ({ actorId: 'actor', assertActive: () => {} }),
}));
vi.mock('../../../../hooks/use-native-calendar-occurrences', () => ({
  nativeOccurrencesKey: (wsId: string) => ['occurrences', wsId],
}));
vi.mock('./use-provider-recurrence-operation', () => ({
  useProviderRecurrenceOperation: ({
    onApplied,
  }: {
    onApplied: () => void;
  }) => {
    mocks.applied = onApplied;
    return {
      pending: mocks.pending,
      submission: {
        mutate: mocks.providerSubmit,
        isPending: false,
        isError: false,
      },
      retry: vi.fn(),
    };
  },
}));
vi.mock('./native-recurrence-fields', () => ({
  NativeRecurrenceFields: () => <div>fields</div>,
}));
vi.mock('../../dialog', () =>
  Object.fromEntries(
    [
      'Dialog',
      'DialogContent',
      'DialogDescription',
      'DialogFooter',
      'DialogHeader',
      'DialogTitle',
    ].map((name) => [
      name,
      ({ children }: PropsWithChildren) => <div>{children}</div>,
    ])
  )
);
vi.mock('../../select', () =>
  Object.fromEntries(
    [
      'Select',
      'SelectContent',
      'SelectItem',
      'SelectTrigger',
      'SelectValue',
    ].map((name) => [
      name,
      ({ children }: PropsWithChildren) => <div>{children}</div>,
    ])
  )
);
vi.mock('../../label', () => ({
  Label: ({ children }: PropsWithChildren) => <label>{children}</label>,
}));

import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { NativeRecurrenceDialog } from './native-recurrence-dialog';

const series = {
  id: 'series',
  ws_id: 'workspace',
  revision: 2,
  workspace_calendar_id: null,
  providerSource: { provider: 'google', connectionId: 'connection' },
  rule: {
    version: 1,
    frequency: 'daily',
    interval: 1,
    timeZone: 'UTC',
    end: { type: 'never' },
  },
  anchor: {
    startLocal: '2026-10-06T09:00:00',
    endLocal: '2026-10-06T10:00:00',
    allDay: false,
  },
  payload: { title: 'Test series' },
  exceptions: [],
};
const occurrence = {
  id: 'instance',
  seriesId: 'series',
  originalStartLocal: '2026-10-06T09:00:00',
  start_at: '2026-10-06T09:00:00Z',
  end_at: '2026-10-06T10:00:00Z',
  title: 'Test series',
} as CalendarEvent;
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <NativeRecurrenceDialog
        wsId="workspace"
        open
        onOpenChange={vi.fn()}
        occurrence={occurrence}
      />
    </QueryClientProvider>
  );
  return { ...view, client };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.pending = false;
  mocks.getSeries.mockResolvedValue(series);
  mocks.capabilities.mockResolvedValue({
    enabled: true,
    sources: [
      {
        provider: 'google',
        connectionId: 'connection',
        label: 'Test Calendar',
      },
    ],
  });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});
describe('imported recurrence mutation routing', () => {
  it('uses the provider operation contract and never the native mutation API', async () => {
    mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'save' })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => expect(mocks.providerSubmit).toHaveBeenCalledTimes(1));
    expect(mocks.providerSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        seriesId: 'series',
        scope: 'this',
        source: { provider: 'google', connectionId: 'connection' },
      })
    );
    expect(mocks.nativeMutate).not.toHaveBeenCalled();
    expect(mocks.nativeCreate).not.toHaveBeenCalled();
  });
  it.each([
    { enabled: false, sources: [] },
    { enabled: true, sources: [] },
  ])(
    'blocks imported writes when admission or actor-owned source is unavailable',
    async (caps) => {
      mocks.capabilities.mockResolvedValue(caps);
      mount();
      await waitFor(() =>
        expect(screen.getByText('provider_disabled')).toBeInTheDocument()
      );
      expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'delete' })).toBeDisabled();
      expect(mocks.providerSubmit).not.toHaveBeenCalled();
      expect(mocks.nativeMutate).not.toHaveBeenCalled();
    }
  );
  it('keeps edits frozen while an ambiguous or pending provider operation is retained', async () => {
    mocks.pending = true;
    mount();
    await waitFor(() =>
      expect(screen.getByText('provider_pending')).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'saving' })).toBeDisabled();
    expect(mocks.nativeMutate).not.toHaveBeenCalled();
  });
});

it('revalidates all provider projections only after applied and only in the affected workspace', async () => {
  const h = mount();
  const ownKeys = [
    ['databaseCalendarEvents', 'workspace', 'dates'],
    ['googleCalendarEvents', 'workspace', 'dates'],
  ];
  const other = ['googleCalendarEvents', 'other-workspace', 'dates'];
  for (const key of [...ownKeys, other])
    h.client.setQueryData(key, [{ id: 'retained' }]);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'save' })).not.toBeDisabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  await waitFor(() => expect(mocks.providerSubmit).toHaveBeenCalled());
  for (const key of ownKeys)
    expect(h.client.getQueryState(key)?.isInvalidated).toBe(false);
  mocks.applied();
  for (const key of ownKeys)
    expect(h.client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(h.client.getQueryState(other)?.isInvalidated).toBe(false);
});
