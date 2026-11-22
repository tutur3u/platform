// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import { QuizArenaPanel } from './quiz-arena-panel';

afterEach(cleanup);
const t = en.meet.call.quizArena;

function panel(query: Record<string, unknown>) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <QuizArenaPanel
          accountId="a"
          meetingId="m"
          query={
            query as unknown as ComponentProps<typeof QuizArenaPanel>['query']
          }
          onClose={() => {}}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

it('names the activity in its loading state', () => {
  panel({ isPending: true, isError: false, isFetching: true, data: undefined });
  expect(screen.getByRole('status').getAttribute('aria-label')).toBe(
    'Loading Quiz Arena'
  );
});

it('replaces the body with a retry only when there is nothing to show', () => {
  const refetch = vi.fn();
  panel({
    isPending: false,
    isError: true,
    isFetching: false,
    data: undefined,
    refetch,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(refetch).toHaveBeenCalledTimes(1);
});

it('keeps the view and shows the banner when a refetch fails, retry waits while fetching', () => {
  const refetch = vi.fn();
  const data = { kind: 'empty', canManage: false };
  panel({ isPending: false, isError: true, isFetching: true, data, refetch });
  expect(screen.getByRole('alert').textContent).toContain(t.load_error);
  expect(screen.getByText(t.empty_participant)).toBeTruthy();
  const retry = screen.getByRole('button', { name: t.retry });
  expect(retry).toHaveProperty('disabled', true);
  cleanup();
  panel({ isPending: false, isError: true, isFetching: false, data, refetch });
  fireEvent.click(screen.getByRole('button', { name: t.retry }));
  expect(refetch).toHaveBeenCalledTimes(1);
});

it('disables the shared retry while a retry is running', () => {
  panel({
    isPending: false,
    isError: true,
    isFetching: true,
    data: undefined,
    refetch: vi.fn(),
  });
  expect(screen.getByRole('button', { name: 'Try again' })).toHaveProperty(
    'disabled',
    true
  );
});
