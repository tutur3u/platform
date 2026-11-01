// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MAX_DISPLAY_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import { Lobby } from './lobby';

function localized(child: ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {child}
    </NextIntlClientProvider>
  );
}

function lobbyProps(overrides: Partial<Parameters<typeof Lobby>[0]> = {}) {
  return {
    defaultDisplayName: '',
    meetingName: 'Weekly Product Sync',
    connectionStatus: 'open' as const,
    error: null,
    isGuest: true,
    isJoining: false,
    waiting: false,
    onJoin: vi.fn(),
    onLeave: vi.fn(),
    onRetry: vi.fn(),
    onDisplayNameChange: vi.fn(),
    ...overrides,
  };
}

function nameInput() {
  return screen.getByLabelText(en.meet.call.your_name) as HTMLInputElement;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('keeps spaces while a guest types a multi-word name keystroke by keystroke', () => {
  const props = lobbyProps();
  render(localized(<Lobby {...props} />));
  const input = nameInput();

  let typed = '';
  for (const key of ['L', 'i', 'n', 'h', ' ', 'A', 'n', 'h']) {
    typed += key;
    fireEvent.change(input, { target: { value: typed } });
    expect(input.value).toBe(typed);
  }
  expect(input.value).toBe('Linh Anh');

  fireEvent.change(input, { target: { value: '  Linh Anh  ' } });
  expect(input.value).toBe('  Linh Anh  ');
  fireEvent.blur(input);
  expect(input.value).toBe('Linh Anh');
  expect(props.onDisplayNameChange).toHaveBeenCalledWith('Linh Anh');

  fireEvent.change(input, { target: { value: 'Trần Thị ' } });
  fireEvent.click(screen.getByRole('button', { name: en.meet.call.join_now }));
  expect(props.onJoin).toHaveBeenCalledWith(
    expect.objectContaining({ displayName: 'Trần Thị' })
  );
});

it('leaves IME composition text untouched and caps the length once it commits', () => {
  const props = lobbyProps();
  render(localized(<Lobby {...props} />));
  const input = nameInput();

  // Telex: "Linh Aa" composes to "Linh Â"; the trailing space must survive.
  fireEvent.change(input, { target: { value: 'Linh ' } });
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: 'Linh A' } });
  expect(input.value).toBe('Linh A');
  fireEvent.change(input, { target: { value: 'Linh Â' } });
  expect(input.value).toBe('Linh Â');
  fireEvent.compositionEnd(input);
  expect(input.value).toBe('Linh Â');

  // Over-long composition text is not cut mid-composition, only on commit.
  const long = `${'a'.repeat(MAX_DISPLAY_NAME_LENGTH - 1)}ươ`;
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: long } });
  expect(input.value).toBe(long);
  fireEvent.compositionEnd(input);
  expect(input.value).toBe(long.slice(0, MAX_DISPLAY_NAME_LENGTH));

  // Enter while composing confirms the IME candidate instead of joining.
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(props.onJoin).not.toHaveBeenCalled();
});
