// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import type { MeetAiDisclosure } from '../../meeting-ai/ai-disclosure-state';
import { AiStatusIndicator } from './ai-status-indicator';

vi.mock('../../../constants/common', () => ({
  TTR_URL: 'https://tuturuuu.com',
}));
afterEach(cleanup);
const active: MeetAiDisclosure = {
  kind: 'active',
  transcription: true,
  mira: true,
};
const view = (disclosure: MeetAiDisclosure) => (
  <NextIntlClientProvider locale="en" messages={en}>
    <AiStatusIndicator disclosure={disclosure} />
  </NextIntlClientProvider>
);

it('keeps an active indicator on join and remount without auto-opening or a dismiss control', () => {
  const first = render(view(active));
  expect(screen.getByRole('button').textContent).toContain(
    en.meet_ai_notice.indicator_on
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button', { name: /dismiss|close/i })).toBeNull();
  first.unmount();
  render(view(active));
  expect(screen.getByRole('button')).toBeTruthy();
});

it('opens once on mid-call activation and keeps the pill when the popover closes', async () => {
  const current = render(view({ kind: 'hidden' }));
  expect(screen.queryByRole('button')).toBeNull();
  current.rerender(view(active));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('button')).toBeTruthy();
  current.rerender(view({ kind: 'off' }));
  current.rerender(view(active));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('dialog')).toBeTruthy();
});
