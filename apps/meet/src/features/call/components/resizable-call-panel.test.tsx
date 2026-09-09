// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en.json';
import { ResizableCallPanel } from './resizable-call-panel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('keeps the separator range and rendered width aligned when the viewport shrinks', () => {
  vi.stubGlobal('innerWidth', 1200);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ResizableCallPanel label="Chat">Messages</ResizableCallPanel>
    </NextIntlClientProvider>
  );
  const separator = screen.getByRole('separator');
  for (let n = 0; n < 20; n++)
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
  expect(separator.getAttribute('aria-valuenow')).toBe('720');
  act(() => {
    vi.stubGlobal('innerWidth', 900);
    window.dispatchEvent(new Event('resize'));
  });
  expect(separator.getAttribute('aria-valuemax')).toBe('540');
  expect(separator.getAttribute('aria-valuenow')).toBe('540');
  expect(
    screen
      .getByRole('complementary')
      .style.getPropertyValue('--call-panel-width')
  ).toBe('540px');
  fireEvent.keyDown(separator, { key: 'ArrowRight' });
  expect(separator.getAttribute('aria-valuenow')).toBe('516');
});
