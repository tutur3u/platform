// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { useMailComposerKeyboard } from './use-mail-composer-keyboard';

afterEach(cleanup);
function setup(preferBody = false) {
  const callbacks = {
    onSend: vi.fn(),
    onSave: vi.fn(),
    onClose: vi.fn(),
    onAi: vi.fn(),
  };
  function App() {
    const keyboard = useMailComposerKeyboard({
      open: true,
      preferBody,
      ...callbacks,
    });
    return h(
      'section',
      { ref: keyboard.ref, onKeyDown: keyboard.onKeyDown, tabIndex: -1 },
      h('input', { 'aria-label': 'Recipient' }),
      h('div', { contentEditable: true, role: 'textbox', 'aria-label': 'Body' })
    );
  }
  return { ...callbacks, ...render(h(App)) };
}
it('focuses recipients for new mail and restores the opener on close', async () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const view = setup();
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Recipient' })
    )
  );
  view.unmount();
  expect(document.activeElement).toBe(opener);
  opener.remove();
});
it('focuses the reply body and supports save, AI and send modifiers', async () => {
  const callbacks = setup(true);
  const body = screen.getByRole('textbox', { name: 'Body' });
  await waitFor(() => expect(document.activeElement).toBe(body));
  fireEvent.keyDown(body, { key: 's', ctrlKey: true });
  await waitFor(() => expect(callbacks.onSave).toHaveBeenCalledOnce());
  expect(callbacks.onClose).not.toHaveBeenCalled();
  fireEvent.keyDown(body, { key: 'j', metaKey: true });
  await waitFor(() => expect(callbacks.onAi).toHaveBeenCalledOnce());
  fireEvent.keyDown(body, { key: 'Enter', ctrlKey: true });
  await waitFor(() => expect(callbacks.onSend).toHaveBeenCalledOnce());
  fireEvent.keyDown(body, { key: 'Enter', ctrlKey: true, repeat: true });
  await waitFor(() => expect(callbacks.onSend).toHaveBeenCalledOnce());
  fireEvent.keyDown(body, { key: 'Escape' });
  await waitFor(() => expect(callbacks.onClose).toHaveBeenCalledOnce());
});
it('leaves normal typing, IME and unrelated modifier combinations alone', () => {
  const callbacks = setup();
  const field = screen.getByRole('textbox', { name: 'Recipient' });
  fireEvent.keyDown(field, { key: 's' });
  fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true, isComposing: true });
  fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true, shiftKey: true });
  expect(callbacks.onSave).not.toHaveBeenCalled();
  expect(callbacks.onSend).not.toHaveBeenCalled();
});
