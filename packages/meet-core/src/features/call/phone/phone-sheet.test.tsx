// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PhoneSheet } from './phone-sheet';

afterEach(cleanup);

function show(onDismiss = vi.fn()) {
  render(
    <PhoneSheet label="Chat" onDismiss={onDismiss}>
      <input aria-label="composer" />
    </PhoneSheet>
  );
  return onDismiss;
}

it('renders a labelled dialog with the content', () => {
  show();
  expect(screen.getByRole('dialog', { name: 'Chat' })).toBeTruthy();
  expect(screen.getByLabelText('composer')).toBeTruthy();
});

it('dismisses from the scrim and Escape', () => {
  const onDismiss = show();
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Chat' })[0] as HTMLElement
  );
  fireEvent.keyDown(screen.getByLabelText('composer'), { key: 'Escape' });
  expect(onDismiss).toHaveBeenCalledTimes(2);
});

it('dismisses when the handle is dragged far enough, and not for a short drag', () => {
  const onDismiss = show();
  const handle = document.querySelector(
    '[aria-hidden="true"].touch-none'
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
  const listeners = new Set<() => void>();
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: {
      height: 420,
      offsetTop: 0,
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
    },
  });
  show();
  const root = screen.getByRole('dialog').parentElement as HTMLElement;
  expect(root.style.height).toBe('420px');
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: undefined,
  });
});
