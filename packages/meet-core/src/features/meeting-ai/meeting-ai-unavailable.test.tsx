// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../apps/meet/messages/en.json';
import vi_ from '../../../../../apps/meet/messages/vi.json';
import {
  type MeetingAiBlock,
  MeetingAiUnavailable,
} from './meeting-ai-unavailable';

const ai = en.meet.ai;
function show(block: MeetingAiBlock, onRetry = vi.fn(), messages = en) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MeetingAiUnavailable block={block} onRetry={onRetry} />
    </NextIntlClientProvider>
  );
  return onRetry;
}
afterEach(cleanup);

it.each([
  ['disabled', ai.off_disabled],
  ['workspace', ai.off_workspace],
  ['audience', ai.off_audience],
] as const)(
  'explains the %s switch and who can change it, without a retry',
  (reason, copy) => {
    show({ kind: 'off', reason });
    expect(screen.getByRole('status').textContent).toContain(copy);
    expect(screen.queryByRole('button')).toBeNull();
    // The generic message never comes back.
    expect(screen.queryByText(ai.workspace_unavailable)).toBeNull();
  }
);

it('offers a retry when the availability check failed', () => {
  const retry = show({ kind: 'off', reason: 'error' });
  expect(screen.getByRole('alert').textContent).toContain(ai.off_error);
  fireEvent.click(screen.getByRole('button', { name: ai.try_again }));
  expect(retry).toHaveBeenCalledOnce();
});

it('offers a retry when the transcript did not load', () => {
  const retry = show({ kind: 'load_failed' });
  expect(screen.getByRole('alert').textContent).toContain(ai.load_failed);
  fireEvent.click(screen.getByRole('button', { name: ai.try_again }));
  expect(retry).toHaveBeenCalledOnce();
});

it('says when the provider is not configured', () => {
  show({ kind: 'not_configured' });
  expect(screen.getByRole('status').textContent).toContain(ai.not_configured);
});

it('has Vietnamese copy for every state', () => {
  for (const key of [
    'off_title',
    'off_disabled',
    'off_workspace',
    'off_audience',
    'off_error',
    'load_failed_title',
    'load_failed',
    'try_again',
  ] as const)
    expect(vi_.meet.ai[key]).toBeTruthy();
});
