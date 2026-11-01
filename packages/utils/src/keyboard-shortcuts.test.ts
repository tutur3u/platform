import { afterEach, describe, expect, it } from 'vitest';
import { isPageShortcutBlocked } from './keyboard-shortcuts';

function press(target: Element) {
  const event = new KeyboardEvent('keydown', { bubbles: true, key: 'c' });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

function openDialog(attributes: Record<string, string> = {}) {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('data-state', 'open');
  for (const [name, value] of Object.entries(attributes))
    dialog.setAttribute(name, value);
  dialog.append(document.createElement('button'));
  document.body.append(dialog);
  return dialog;
}

describe('isPageShortcutBlocked', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('blocks page keys while a modal dialog is open', () => {
    openDialog();
    expect(isPageShortcutBlocked(press(document.body))).toBe(true);
  });

  it('lets page keys through beside an open side panel', () => {
    openDialog({ 'data-presentation': 'panel' });
    expect(isPageShortcutBlocked(press(document.body))).toBe(false);
  });

  it('keeps keys pressed inside the side panel to the panel', () => {
    const panel = openDialog({ 'data-presentation': 'panel' });
    expect(isPageShortcutBlocked(press(panel.firstElementChild!))).toBe(true);
  });
});
