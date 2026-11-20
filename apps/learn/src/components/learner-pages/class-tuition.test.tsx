import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import { LearnerClassTuition } from './class-tuition';

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), read: vi.fn() }));
vi.mock('@tuturuuu/internal-api/finance-class-tuition', () => ({
  getClassTuition: mocks.read,
}));
vi.mock('@tuturuuu/education-core/education/lms-rollout', () => ({
  learnerProgressRoutesEnabled: mocks.enabled,
}));

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

function mount(studentId: string | null) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider
        locale="en"
        messages={en}
        now={new Date('2026-11-20T01:00:00Z')}
        timeZone="UTC"
      >
        <LearnerClassTuition
          classId="geometry"
          wsId="center"
          studentId={studentId}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

it('keeps the closed rollout free of tuition controls and reads', () => {
  mocks.enabled.mockReturnValue(false);
  mount(null);
  expect(screen.queryByRole('button', { name: 'Tuition status' })).toBeNull();
  expect(mocks.read).not.toHaveBeenCalled();
});

it.each([null, 'guardian-selected'])(
  'reads the selected learner on disclosure (%s)',
  async (studentId) => {
    mocks.enabled.mockReturnValue(true);
    mocks.read.mockResolvedValue({
      data: [{ contact_id: 'learner', status: 'paid' }],
    });
    mount(studentId);
    expect(mocks.read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tuition status' }));
    expect(await screen.findByText('Paid')).toBeTruthy();
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith('center', 'geometry', {
      month: '2026-11',
      view: 'learning',
      studentId,
    });
  }
);
