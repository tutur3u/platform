import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TASK_CARD_HOTKEYS,
  findTaskCardHotkeyConflict,
  keyboardEventToTaskCardBinding,
  parseTaskCardHotkeyBindings,
  taskCardHotkeyMatches,
} from './task-card-hotkeys';

describe('task card hotkeys', () => {
  it('normalizes plain and modified keyboard events', () => {
    expect(
      keyboardEventToTaskCardBinding(new KeyboardEvent('keydown', { key: 'p' }))
    ).toBe('P');
    expect(
      keyboardEventToTaskCardBinding(
        new KeyboardEvent('keydown', {
          key: 'p',
          metaKey: true,
          shiftKey: true,
        })
      )
    ).toBe('Mod+Shift+P');
    expect(
      keyboardEventToTaskCardBinding(
        new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true })
      )
    ).toBeNull();
  });

  it('matches cross-platform modifier bindings', () => {
    expect(
      taskCardHotkeyMatches(
        new KeyboardEvent('keydown', { key: 'm', ctrlKey: true }),
        'Mod+M'
      )
    ).toBe(true);
  });

  it('keeps defaults for malformed or partial persisted settings', () => {
    expect(parseTaskCardHotkeyBindings('not-json')).toBe(
      DEFAULT_TASK_CARD_HOTKEYS
    );
    expect(parseTaskCardHotkeyBindings('{"priority":"Shift+1"}')).toEqual({
      ...DEFAULT_TASK_CARD_HOTKEYS,
      priority: 'Shift+1',
    });
  });

  it('detects collisions while allowing disabled bindings', () => {
    expect(
      findTaskCardHotkeyConflict(DEFAULT_TASK_CARD_HOTKEYS, 'labels', 'P')
    ).toBe('priority');
    expect(
      findTaskCardHotkeyConflict(DEFAULT_TASK_CARD_HOTKEYS, 'labels', '')
    ).toBeNull();
  });
});
