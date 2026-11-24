import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
import timezones from '@tuturuuu/utils/timezones';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditPlanDialog from './edit-plan-dialog';

const updateMeetPlan = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api', () => ({
  updateMeetPlan,
  deleteMeetPlan: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/meet/plans/x',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const group = (timezones as Timezone[]).find(
  (candidate) => candidate.text === '(UTC+07:00) Bangkok, Hanoi, Jakarta'
) as Timezone;
vi.mock('./timezone-selector', () => ({
  default: ({ onValueChange }: { onValueChange: (tz: Timezone) => void }) => (
    <button type="button" onClick={() => onValueChange(group)}>
      pick-tz
    </button>
  ),
}));
vi.mock('./date-selector', () => ({ default: () => null }));
vi.mock('./time-selector', () => ({ TimeSelector: () => null }));

beforeEach(() => {
  const resolved = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(
    function (this: Intl.DateTimeFormat) {
      return { ...resolved.call(this), timeZone: 'Europe/Paris' };
    }
  );
});
afterEach(() => vi.restoreAllMocks());

describe('EditPlanDialog timezone', () => {
  it('saves a civil zone for the picked group, never its first listed zone', async () => {
    updateMeetPlan.mockResolvedValue({ plan: {} });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EditPlanDialog
          plan={
            {
              id: 'plan-1',
              name: 'x',
              dates: ['2026-12-01'],
              start_time: '9:00:00+00',
              end_time: '17:00:00+00',
              timezone: 'Europe/London',
              duration_minutes: 60,
            } as never
          }
        />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(await screen.findByText('pick-tz'));
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(updateMeetPlan).toHaveBeenCalled());
    const saved = updateMeetPlan.mock.calls[0]?.[1].timezone;
    expect(saved).toBe('Asia/Bangkok');
  });
});
