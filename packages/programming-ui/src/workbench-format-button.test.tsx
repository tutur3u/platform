// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../apps/meet/messages/en.json';
import vi_messages from '../../../apps/meet/messages/vi.json';
import type { FormatSupport } from './format/formatters';
import { WorkbenchFormatButton } from './workbench-format-button';

afterEach(cleanup);
const t = messages.programmingPlayground;
const ok: FormatSupport = {
  supported: true,
  language: 'python',
  formatter: { name: 'Ruff', format: vi.fn() },
};
function mount(
  support: FormatSupport,
  over: Partial<{ editable: boolean; pending: boolean }> = {}
) {
  const onFormat = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchFormatButton
        support={support}
        editable={over.editable ?? true}
        pending={over.pending ?? false}
        onFormat={onFormat}
      />
    </NextIntlClientProvider>
  );
  return onFormat;
}

it('formats on click and advertises Shift+Alt+F', () => {
  const onFormat = mount(ok);
  const button = screen.getByRole('button', { name: t.format });
  expect(button.getAttribute('aria-disabled')).toBeNull();
  expect(button.getAttribute('aria-keyshortcuts')).toBe('Shift+Alt+F');
  fireEvent.click(button);
  expect(onFormat).toHaveBeenCalledTimes(1);
});

it.each([
  ['rust', t.formatUnsupportedRust],
  ['ruby', t.formatUnsupportedRuby],
  ['unknown', t.formatUnsupportedUnknown],
] as const)(
  'stays focusable but disabled, saying why, for %s',
  (reason, text) => {
    const onFormat = mount({ supported: false, reason });
    const button = screen.getByRole('button', { name: t.format });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(
      document.getElementById(button.getAttribute('aria-describedby')!)
        ?.textContent
    ).toBe(text);
    fireEvent.click(button);
    expect(onFormat).not.toHaveBeenCalled();
  }
);

it('is disabled for someone who cannot edit, and busy while formatting', () => {
  const readOnly = mount(ok, { editable: false });
  const button = screen.getByRole('button', { name: t.format });
  expect(button.getAttribute('aria-disabled')).toBe('true');
  expect(
    document.getElementById(button.getAttribute('aria-describedby')!)
      ?.textContent
  ).toBe(t.formatReadOnly);
  fireEvent.click(button);
  expect(readOnly).not.toHaveBeenCalled();
  cleanup();
  const busy = mount(ok, { pending: true });
  const working = screen.getByRole('button', { name: t.formatting });
  fireEvent.click(working);
  expect(busy).not.toHaveBeenCalled();
});

it('names Format in Vietnamese', () => {
  expect(vi_messages.programmingPlayground.format).toBe('Định dạng');
  expect(vi_messages.programmingPlayground.formatUnsupportedRust).toBeTruthy();
});
