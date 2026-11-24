// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PhoneSheet } from './phone-sheet';

afterEach(cleanup);

function show(onDismiss = vi.fn()) {
  render(
    <>
      <button type="button">behind</button>
      <PhoneSheet label="Chat" onDismiss={onDismiss}>
        <input aria-label="composer" />
        <button type="button">inside</button>
      </PhoneSheet>
    </>
  );
  return onDismiss;
}

it('is a modal dialog that holds focus and hides the call behind it', () => {
  show();
  const dialog = screen.getByRole('dialog', { name: 'Chat' });
  expect(dialog).toBeTruthy();
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(screen.queryByRole('button', { name: 'behind' })).toBeNull();
});

it('dismisses from Escape wherever focus is and draws a scrim', () => {
  const onDismiss = show();
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(onDismiss).toHaveBeenCalledTimes(1);
  // The scrim is the dialog's own overlay, so a tap outside closes it.
  expect(document.querySelector('[data-slot="sheet-overlay"]')).toBeTruthy();
});

it('dismisses when the handle is dragged far enough, and not for a short drag', () => {
  const onDismiss = show();
  const handle = document.querySelector(
    '[data-phone-sheet-handle]'
  ) as HTMLElement;
  fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientY: 140, pointerId: 1 });
  fireEvent.pointerUp(handle, { pointerId: 1 });
  expect(onDismiss).not.toHaveBeenCalled();
  fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientY: 240, pointerId: 1 });
  fireEvent.pointerUp(handle, { pointerId: 1 });
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

it('sizes to the visual viewport so the composer clears the keyboard', () => {
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: {
      height: 420,
      offsetTop: 0,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  show();
  const dialog = screen.getByRole('dialog');
  expect(dialog.style.height).toBe('420px');
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: undefined,
  });
});
