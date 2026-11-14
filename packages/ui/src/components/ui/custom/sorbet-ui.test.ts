import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  announceSorbetUi,
  applySorbetUi,
  parseSorbetUiValue,
  readStoredSorbetUi,
  SORBET_UI_CHANGE_EVENT,
  SORBET_UI_STORAGE_KEY,
} from './sorbet-ui';

afterEach(() => {
  document.documentElement.removeAttribute('data-ui');
  window.localStorage.clear();
});

describe('sorbet ui preference', () => {
  it('parses only an explicit true as enabled', () => {
    expect(parseSorbetUiValue('true')).toBe(true);
    expect(parseSorbetUiValue(true)).toBe(true);
    expect(parseSorbetUiValue('false')).toBe(false);
    expect(parseSorbetUiValue(null)).toBe(false);
    expect(parseSorbetUiValue('yes')).toBe(false);
  });

  it('sets and clears data-ui on the root and remembers the value', () => {
    applySorbetUi(true);
    expect(document.documentElement.getAttribute('data-ui')).toBe('sorbet');
    expect(readStoredSorbetUi()).toBe(true);

    applySorbetUi(false);
    expect(document.documentElement.hasAttribute('data-ui')).toBe(false);
    expect(window.localStorage.getItem(SORBET_UI_STORAGE_KEY)).toBe('false');
  });

  it('leaves an unrelated data-ui value alone when disabling', () => {
    document.documentElement.setAttribute('data-ui', 'other');
    applySorbetUi(false);
    expect(document.documentElement.getAttribute('data-ui')).toBe('other');
  });

  it('returns null when nothing is stored', () => {
    expect(readStoredSorbetUi()).toBeNull();
  });

  it('announces changes to listeners in the same tab', () => {
    const listener = vi.fn();
    window.addEventListener(SORBET_UI_CHANGE_EVENT, listener);
    announceSorbetUi(true);
    window.removeEventListener(SORBET_UI_CHANGE_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0] as
      | CustomEvent<boolean>
      | undefined;
    expect(event?.detail).toBe(true);
    expect(document.documentElement.getAttribute('data-ui')).toBe('sorbet');
  });
});
