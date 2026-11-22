import { describe, expect, it } from 'vitest';
import {
  type EventDialogKey,
  formatEventTimeZone,
  isEventDialogSubmitShortcut,
  isEventFieldSubmitKey,
} from './event-dialog-keys';

const key = (init: Partial<EventDialogKey>): EventDialogKey => ({
  key: 'Enter',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...init,
});

describe('event dialog shortcuts', () => {
  it('saves on Cmd+Enter or Ctrl+Enter from any field', () => {
    expect(isEventDialogSubmitShortcut(key({ metaKey: true }))).toBe(true);
    expect(isEventDialogSubmitShortcut(key({ ctrlKey: true }))).toBe(true);
    expect(isEventDialogSubmitShortcut(key({}))).toBe(false);
    expect(
      isEventDialogSubmitShortcut(key({ metaKey: true, altKey: true }))
    ).toBe(false);
    expect(isEventDialogSubmitShortcut(key({ key: 's', metaKey: true }))).toBe(
      false
    );
  });

  it('saves on a plain Enter in single-line fields only', () => {
    expect(isEventFieldSubmitKey(key({}))).toBe(true);
    for (const modifier of ['shiftKey', 'altKey', 'metaKey', 'ctrlKey']) {
      expect(isEventFieldSubmitKey(key({ [modifier]: true }))).toBe(false);
    }
    expect(isEventFieldSubmitKey(key({ key: 'Tab' }))).toBe(false);
  });

  it('never saves while an input method is composing', () => {
    expect(isEventFieldSubmitKey(key({ isComposing: true }))).toBe(false);
    expect(
      isEventDialogSubmitShortcut(key({ metaKey: true, isComposing: true }))
    ).toBe(false);
  });
});

describe('formatEventTimeZone', () => {
  const at = new Date('2026-11-22T03:00:00Z');

  it('shows the offset and city of a named zone', () => {
    expect(formatEventTimeZone('Asia/Ho_Chi_Minh', at, 'en-US')).toBe(
      'GMT+7 · Ho Chi Minh'
    );
    expect(formatEventTimeZone('America/New_York', at, 'en-US')).toBe(
      'GMT-5 · New York'
    );
  });

  it('falls back to the browser zone for "auto" or no setting', () => {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(formatEventTimeZone('auto', at, 'en-US')).toBe(
      formatEventTimeZone(browser, at, 'en-US')
    );
    expect(formatEventTimeZone(undefined, at, 'en-US')).toBe(
      formatEventTimeZone(browser, at, 'en-US')
    );
  });

  it('returns the raw zone when the runtime cannot format it', () => {
    expect(formatEventTimeZone('Not/AZone', at, 'en-US')).toBe('Not/AZone');
  });
});
