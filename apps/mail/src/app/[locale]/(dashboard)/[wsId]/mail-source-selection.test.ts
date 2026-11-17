import { describe, expect, it } from 'vitest';
import {
  applyMailSelection,
  CONNECTED_MAIL_FOLDERS,
  getSourceFolderHref,
  isConnectedMailFolder,
  resolveConnectedAccountId,
  resolveConnectedMailFolder,
  resolveSelectionPathname,
} from './mail-source-selection';

describe('connected folders', () => {
  it('exposes only provider folders and hides managed-only ones', () => {
    expect([...CONNECTED_MAIL_FOLDERS]).toEqual([
      'inbox',
      'sent',
      'drafts',
      'archive',
      'spam',
      'trash',
    ]);
    for (const folder of ['snoozed', 'muted', 'starred', 'blocked']) {
      expect(isConnectedMailFolder(folder)).toBe(false);
    }
    expect(isConnectedMailFolder(undefined)).toBe(false);
  });

  it('falls back to the inbox for managed-only or unknown routes', () => {
    expect(resolveConnectedMailFolder('trash')).toBe('trash');
    expect(resolveConnectedMailFolder('starred')).toBe('inbox');
    expect(resolveConnectedMailFolder('blocked')).toBe('inbox');
    expect(resolveConnectedMailFolder(null)).toBe('inbox');
  });
});

describe('applyMailSelection', () => {
  it('selects a managed mailbox and drops connected and thread state', () => {
    const params = applyMailSelection(
      'connected=1&account=acc-1&thread=t1&compose=1',
      { kind: 'managed', mailboxId: 'mb-1' },
      false
    );
    expect(params.get('mailbox')).toBe('mb-1');
    expect(params.has('connected')).toBe(false);
    expect(params.has('account')).toBe(false);
    expect(params.has('thread')).toBe(false);
    expect(params.get('compose')).toBe('1');
  });

  it('keeps managed explicit when connected is the default source', () => {
    const params = applyMailSelection(
      '',
      { kind: 'managed', mailboxId: 'mb-1' },
      true
    );
    expect(params.get('connected')).toBe('');
    expect(params.toString()).toBe('mailbox=mb-1&connected=');
  });

  it('selects a connected account and drops managed-only state', () => {
    const params = applyMailSelection(
      'mailbox=mb-1&label=news&folderId=f1&thread=t1',
      { kind: 'connected', accountId: 'acc-2' },
      false
    );
    expect(params.get('connected')).toBe('1');
    expect(params.get('account')).toBe('acc-2');
    for (const key of ['mailbox', 'label', 'folderId', 'thread']) {
      expect(params.has(key)).toBe(false);
    }
  });

  it('does not mutate the caller params', () => {
    const current = new URLSearchParams('mailbox=mb-1');
    applyMailSelection(
      current,
      { kind: 'connected', accountId: 'acc-2' },
      false
    );
    expect(current.toString()).toBe('mailbox=mb-1');
  });
});

describe('getSourceFolderHref', () => {
  const base = { composing: false, href: '/personal/sent?q=x' };

  it('keeps the connected account on folder links', () => {
    expect(
      getSourceFolderHref({
        ...base,
        accountId: 'acc-1',
        mailboxId: 'mb-1',
        source: 'connected',
      })
    ).toBe('/personal/sent?connected=1&account=acc-1');
  });

  it('keeps managed explicit on folder links even when connected is the default', () => {
    expect(
      getSourceFolderHref({
        ...base,
        accountId: null,
        composing: true,
        mailboxId: 'mb-1',
        source: 'managed',
      })
    ).toBe('/personal/sent?connected=&mailbox=mb-1&compose=1');
  });

  it('leaves the link alone before a managed mailbox is known', () => {
    expect(
      getSourceFolderHref({
        ...base,
        accountId: null,
        mailboxId: null,
        source: 'managed',
      })
    ).toBe('/personal/sent?q=x');
    expect(
      getSourceFolderHref({
        accountId: null,
        composing: false,
        href: undefined,
        mailboxId: null,
        source: 'managed',
      })
    ).toBe('#');
  });
});

describe('resolveConnectedAccountId', () => {
  const accounts = [{ id: 'a' }, { id: 'b' }];

  it('uses the requested account when it still exists', () => {
    expect(resolveConnectedAccountId(accounts, 'b')).toBe('b');
  });

  it('falls back to the first account after a disconnect', () => {
    expect(resolveConnectedAccountId(accounts, 'gone')).toBe('a');
    expect(resolveConnectedAccountId(accounts, null)).toBe('a');
    expect(resolveConnectedAccountId([], 'a')).toBeNull();
  });

  it('trusts the URL until accounts load', () => {
    expect(resolveConnectedAccountId(undefined, 'b')).toBe('b');
  });
});

describe('resolveSelectionPathname', () => {
  it('moves managed-only folders to the inbox for connected accounts', () => {
    expect(
      resolveSelectionPathname('/en/personal/snoozed', {
        kind: 'connected',
        accountId: 'a',
      })
    ).toBe('/en/personal/inbox');
  });

  it('keeps supported folders and managed selections in place', () => {
    expect(
      resolveSelectionPathname('/en/personal/sent', {
        kind: 'connected',
        accountId: 'a',
      })
    ).toBe('/en/personal/sent');
    expect(
      resolveSelectionPathname('/en/personal/starred', {
        kind: 'managed',
        mailboxId: 'm',
      })
    ).toBe('/en/personal/starred');
  });
});
