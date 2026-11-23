// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import { IncomingVideoStatus } from './incoming-video-status';

afterEach(cleanup);
const messages = {
  meet: { call: { incoming_video_unavailable: 'Some video is not arriving.' } },
};
const view = (status: 'ok' | 'unavailable') =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <IncomingVideoStatus status={status} />
    </NextIntlClientProvider>
  );

it('stays out of the way while recovery is working', () => {
  const { container } = view('ok');
  expect(container.textContent).toBe('');
});

it('shows a quiet status with no button or spinner after the retries run out', () => {
  const { container, getByRole } = view('unavailable');
  expect(getByRole('status').textContent).toBe('Some video is not arriving.');
  expect(container.querySelector('button')).toBeNull();
  expect(container.querySelector('[class*="animate-spin"]')).toBeNull();
});
