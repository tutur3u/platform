// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rememberDefaultMailbox, useMailboxHint } from './mail-mailbox-hint';

describe('mail-mailbox-hint', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(cleanup);

  it('isolates remembered default mailboxes by account ID', () => {
    rememberDefaultMailbox('personal', 'mailbox-a', 'actor-a');
    rememberDefaultMailbox('personal', 'mailbox-b', 'actor-b');

    const hookA = renderHook(() => useMailboxHint('personal', 'actor-a'));
    const hookB = renderHook(() => useMailboxHint('personal', 'actor-b'));
    const hookC = renderHook(() => useMailboxHint('personal', 'actor-c'));

    expect(hookA.result.current).toBe('mailbox-a');
    expect(hookB.result.current).toBe('mailbox-b');
    expect(hookC.result.current).toBeNull();
  });

  it('clears only the owning account hint when forgotten', () => {
    rememberDefaultMailbox('personal', 'mailbox-a', 'actor-a');
    rememberDefaultMailbox('personal', 'mailbox-b', 'actor-b');
    rememberDefaultMailbox('personal', undefined, 'actor-a');

    expect(
      renderHook(() => useMailboxHint('personal', 'actor-a')).result.current
    ).toBeNull();
    expect(
      renderHook(() => useMailboxHint('personal', 'actor-b')).result.current
    ).toBe('mailbox-b');
  });
});
