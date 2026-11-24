import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
import timezones from '@tuturuuu/utils/timezones';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CreatePlanDialog from './create-plan-dialog';

const createMeetPlan = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api', () => ({ createMeetPlan }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const group = (timezones as Timezone[]).find(
  (candidate) => candidate.text === '(UTC+07:00) Bangkok, Hanoi, Jakarta'
) as Timezone;

beforeEach(() => {
  const resolved = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(
    function (this: Intl.DateTimeFormat) {
      return { ...resolved.call(this), timeZone: 'Europe/Paris' };
    }
  );
});
afterEach(() => vi.restoreAllMocks());

describe('CreatePlanDialog timezone', () => {
  it('saves a civil zone from the picked group, never its first listed zone', async () => {
    createMeetPlan.mockResolvedValue({ id: 'a-b' });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CreatePlanDialog
          user={null}
          plan={
            {
              dates: [new Date('2026-12-01')],
              startTime: 9,
              endTime: 17,
              timezone: group,
              durationMinutes: 60,
            } as never
          }
        />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByText('create_plan'));
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(createMeetPlan).toHaveBeenCalled());
    const saved = createMeetPlan.mock.calls[0]?.[0].timezone;
    expect(saved).toBe('Asia/Bangkok');
  });
});
