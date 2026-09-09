// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement as h, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { RecipientField } from './recipient-field';
import { useMailComposerKeyboard } from './use-mail-composer-keyboard';

afterEach(cleanup);
function setup() {
  const send = vi.fn();
  const save = vi.fn();
  const close = vi.fn();
  function App() {
    const [recipients, setRecipients] = useState<string[]>([]);
    const keyboard = useMailComposerKeyboard({
      open: true,
      preferBody: false,
      onSend: () => send(recipients),
      onSave: () => save(recipients),
      onClose: () => close(recipients),
      onAi: vi.fn(),
    });
    return h(
      'section',
      { ref: keyboard.ref, onKeyDown: keyboard.onKeyDown },
      h(RecipientField, {
        label: 'To',
        recipients,
        onChange: setRecipients,
        removeLabel: (address) => address,
      })
    );
  }
  render(h(App));
  return { send, save, close };
}
it.each([
  ['Enter', 'send'],
  ['s', 'save'],
  ['Escape', 'close'],
] as const)('commits typed recipients before %s', async (key, action) => {
  const actions = setup();
  const input = screen.getByRole('textbox', { name: 'To' });
  fireEvent.change(input, { target: { value: 'friend@example.com' } });
  fireEvent.keyDown(input, { key, ctrlKey: key !== 'Escape' });
  await waitFor(() =>
    expect(actions[action]).toHaveBeenCalledWith(['friend@example.com'])
  );
});
it('keeps invalid recipients open instead of sending or losing input', async () => {
  const actions = setup();
  const input = screen.getByRole('textbox', { name: 'To' });
  fireEvent.change(input, { target: { value: 'not-an-email' } });
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
  fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
  expect(actions.send).not.toHaveBeenCalled();
  expect(actions.close).not.toHaveBeenCalled();
});
