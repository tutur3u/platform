// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MailThreadSummary } from '@tuturuuu/internal-api';
import { createElement as h, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type MailKeyboardOptions, useMailKeyboard } from './use-mail-keyboard';

const threads = [
  { id: 'a', starred: false },
  { id: 'b', starred: true },
  { id: 'c', starred: false },
] as MailThreadSummary[];
function setup(overrides: Partial<MailKeyboardOptions> = {}) {
  const callbacks = {
    openThread: vi.fn(),
    compose: vi.fn(),
    reply: vi.fn(),
    action: vi.fn(),
    bulkAction: vi.fn(),
    deleteDraft: vi.fn(),
    navigate: vi.fn(),
    refresh: vi.fn(),
  };
  function App() {
    const [selected, setSelected] = useState(new Set<string>());
    const keyboard = useMailKeyboard({
      threads,
      threadId: 'a',
      folder: 'inbox',
      selectionScope: 'inbox',
      composerOpen: false,
      selected,
      setSelected,
      ...callbacks,
      ...overrides,
    });
    return h(
      'div',
      { ref: keyboard.rootRef },
      h('input', { 'aria-label': 'Search', 'data-mail-search': true }),
      h('div', { contentEditable: true, 'data-testid': 'editor' }),
      ...threads.map((thread) =>
        h(
          'div',
          { key: thread.id, 'data-mail-thread-id': thread.id },
          h(
            'button',
            {
              type: 'button',
              'data-mail-thread-open': thread.id,
              onClick: () => callbacks.openThread(thread.id),
            },
            thread.id
          )
        )
      ),
      h('output', null, [...selected].join(',')),
      h('span', null, keyboard.helpOpen ? 'Help open' : 'Help closed'),
      h('iframe', { title: 'Email' })
    );
  }
  const view = render(h(App));
  return { ...callbacks, ...view };
}
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([
    {},
  ] as unknown as DOMRectList);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const key = (target: Element | Window, value: string, extra = {}) =>
  fireEvent.keyDown(target, { key: value, ...extra });

it('moves row focus with arrows and opens via the existing button', () => {
  const actions = setup({ threadId: null });
  const first = screen.getByRole('button', { name: 'a' });
  first.focus();
  key(first, 'ArrowDown');
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'b' })
  );
  expect(actions.openThread).not.toHaveBeenCalled();
  key(document.activeElement!, 'End');
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'c' })
  );
  key(document.activeElement!, 'o');
  expect(actions.openThread).toHaveBeenCalledWith('c');
});
it('j/k changes the open reader and actions target the focused row', () => {
  const actions = setup();
  const first = screen.getByRole('button', { name: 'a' });
  first.focus();
  key(first, 'j');
  expect(actions.openThread).toHaveBeenCalledWith('b');
  key(document.activeElement!, 's');
  expect(actions.action).toHaveBeenCalledWith('unstar', 'b');
});
it('supports checkbox selection and bulk archive', () => {
  const actions = setup();
  const first = screen.getByRole('button', { name: 'a' });
  key(first, 'x');
  expect(screen.getByRole('status').textContent).toBe('a');
  key(first, 'e');
  expect(actions.bulkAction).toHaveBeenCalledWith('archive');
  expect(actions.action).not.toHaveBeenCalled();
  key(first, 'X', { shiftKey: true });
  expect(screen.getByRole('status').textContent).toBe('a,b,c');
  key(first, 'Escape');
  expect(screen.getByRole('status').textContent).toBe('');
});
it.each(['INPUT', 'EDITOR', 'MODAL', 'COMPOSER', 'IME', 'REPEAT', 'MODIFIER'])(
  'does not dispatch actions for %s',
  (guard) => {
    const actions = setup({ composerOpen: guard === 'COMPOSER' });
    let target: Element = document.body;
    if (guard === 'INPUT')
      target = screen.getByRole('textbox', { name: 'Search' });
    if (guard === 'EDITOR') target = screen.getByTestId('editor');
    if (guard === 'MODAL') {
      const modal = document.createElement('div');
      modal.setAttribute('role', 'dialog');
      modal.dataset.state = 'open';
      document.body.append(modal);
    }
    key(target, 'e', {
      isComposing: guard === 'IME',
      repeat: guard === 'REPEAT',
      ctrlKey: guard === 'MODIFIER',
    });
    expect(actions.action).not.toHaveBeenCalled();
    document.querySelector('[role="dialog"]')?.remove();
  }
);
it('supports folder sequences, search, compose, help and scoped replies', () => {
  const actions = setup();
  key(window, 'g');
  key(window, 'd');
  expect(actions.navigate).toHaveBeenCalledWith('drafts');
  key(window, '/');
  expect(document.activeElement).toBe(
    screen.getByRole('textbox', { name: 'Search' })
  );
  key(window, 'c');
  expect(actions.compose).toHaveBeenCalledOnce();
  key(window, 'r');
  expect(actions.reply).toHaveBeenCalledWith('reply');
  key(window, 'R', { shiftKey: true });
  expect(actions.refresh).toHaveBeenCalledOnce();
  key(window, '?', { shiftKey: true });
  expect(screen.getByText('Help open')).toBeTruthy();
});
it('disabling character shortcuts preserves arrow navigation', () => {
  localStorage.setItem('tuturuuu-mail-keyboard-shortcuts', 'off');
  const actions = setup();
  const first = screen.getByRole('button', { name: 'a' });
  key(first, 'e');
  key(first, 'c');
  key(first, '?');
  expect(actions.action).not.toHaveBeenCalled();
  expect(actions.compose).not.toHaveBeenCalled();
  key(first, 'ArrowDown');
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'b' })
  );
});
it('receives keys from email frames while preserving editable targets and cleanup', () => {
  const actions = setup();
  const frame = screen.getByTitle('Email') as HTMLIFrameElement;
  const doc = frame.contentDocument!;
  key(doc.body, 'e');
  expect(actions.action).toHaveBeenCalledWith('archive', 'a');
  const input = doc.createElement('input');
  doc.body.append(input);
  key(input, 'e');
  expect(actions.action).toHaveBeenCalledOnce();
  const body = doc.body;
  actions.unmount();
  key(body, 'e');
  expect(actions.action).toHaveBeenCalledOnce();
});
it('expires folder sequences and does not apply mailbox actions to drafts', () => {
  const actions = setup({ folder: 'drafts' });
  const clock = vi.spyOn(performance, 'now').mockReturnValue(100);
  key(window, 'g');
  clock.mockReturnValue(1500);
  key(window, 'i');
  expect(actions.navigate).not.toHaveBeenCalled();
  key(window, 'e');
  expect(actions.action).not.toHaveBeenCalled();
  key(window, '#', { shiftKey: true });
  expect(actions.deleteDraft).toHaveBeenCalledOnce();
});
