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
import messages from '../../../../../../apps/meet/messages/en.json';
import { ResizableCallPanel } from './resizable-call-panel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
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

it('remembers the width by account across panels and resets from either input', () => {
  vi.stubGlobal('innerWidth', 1200);
  const view = (ownerId: string, label: string) =>
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResizableCallPanel ownerId={ownerId} label={label}>
          Content
        </ResizableCallPanel>
      </NextIntlClientProvider>
    );
  const separator = () => screen.getByRole('separator');
  view('a', 'Chat');
  fireEvent.keyDown(separator(), { key: 'ArrowLeft' });
  expect(separator().getAttribute('aria-valuenow')).toBe('384');
  cleanup();
  view('b', 'Participants');
  expect(separator().getAttribute('aria-valuenow')).toBe('360');
  cleanup();
  view('a', 'Participants');
  expect(separator().getAttribute('aria-valuenow')).toBe('384');

  fireEvent.keyDown(separator(), { key: 'Home' });
  expect(separator().getAttribute('aria-valuenow')).toBe('280');
  fireEvent.keyDown(separator(), { key: 'End' });
  expect(separator().getAttribute('aria-valuenow')).toBe('720');
  fireEvent.keyDown(separator(), { key: 'Enter' });
  expect(separator().getAttribute('aria-valuenow')).toBe('360');
  fireEvent.keyDown(separator(), { key: 'ArrowRight' });
  fireEvent.doubleClick(separator());
  expect(separator().getAttribute('aria-valuenow')).toBe('360');
});

it('resizes for the current panel when storage is blocked', () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('Blocked', 'SecurityError');
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ResizableCallPanel label="Chat">Messages</ResizableCallPanel>
    </NextIntlClientProvider>
  );
  const separator = screen.getByRole('separator');
  fireEvent.keyDown(separator, { key: 'ArrowLeft' });
  expect(separator.getAttribute('aria-valuenow')).toBe('384');
});
