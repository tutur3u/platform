import { describe, expect, it } from 'vitest';
import {
  defaultContactWorkspaceId,
  senderContactName,
  splitSenderName,
} from './mail-contact-prefill';

describe('splitSenderName', () => {
  it('uses the last word as the given name for Vietnamese names', () => {
    expect(splitSenderName('Nguyễn Thị Lan', 'lan.nguyen@sepay.vn')).toEqual({
      fullName: 'Nguyễn Thị Lan',
      displayName: 'Lan',
      placeholder: '',
    });
    expect(splitSenderName('Trần Minh', 'minh@example.com').displayName).toBe(
      'Minh'
    );
  });

  it('uses the first word for given-name-first names', () => {
    expect(splitSenderName('Phuc Vo', 'phuc@example.com')).toEqual({
      fullName: 'Phuc Vo',
      displayName: 'Phuc',
      placeholder: '',
    });
  });

  it('reorders "Surname, Given" names', () => {
    expect(splitSenderName('Doe, John', 'john@example.com')).toMatchObject({
      fullName: 'John Doe',
      displayName: 'John',
    });
    expect(splitSenderName('Nguyễn, Lan', 'lan@example.com')).toMatchObject({
      fullName: 'Nguyễn Lan',
      displayName: 'Lan',
    });
  });

  it('keeps organisation names as the display name only', () => {
    expect(splitSenderName('Team SePay', 'team@sepay.vn')).toEqual({
      fullName: '',
      displayName: 'Team SePay',
      placeholder: '',
    });
    expect(splitSenderName('Vercel', 'billing@vercel.com').fullName).toBe('');
  });

  it('cleans quotes, underscores and all-caps headers', () => {
    expect(splitSenderName('"TOPCV_BUSINESS"', 'insights@topcv.vn')).toEqual({
      fullName: '',
      displayName: 'Topcv Business',
      placeholder: '',
    });
    expect(splitSenderName('NGUYEN VAN AN', 'an@example.com')).toMatchObject({
      fullName: 'Nguyen Van An',
      displayName: 'An',
    });
  });

  it('only suggests a placeholder when the header has no name', () => {
    expect(splitSenderName(null, 'lan.nguyen@sepay.vn')).toEqual({
      fullName: '',
      displayName: '',
      placeholder: 'Lan Nguyen',
    });
    expect(splitSenderName('lan@sepay.vn', 'lan@sepay.vn').placeholder).toBe(
      'Lan'
    );
    expect(splitSenderName('', 'noreply@topcv.vn').placeholder).toBe('');
  });
});

describe('senderContactName', () => {
  it('prefers the full name and falls back to the display name', () => {
    expect(
      senderContactName({ fullName: 'A B', displayName: 'A', placeholder: '' })
    ).toBe('A B');
    expect(
      senderContactName({ fullName: '', displayName: 'Team', placeholder: '' })
    ).toBe('Team');
  });
});

describe('defaultContactWorkspaceId', () => {
  const workspaces = [
    { id: 'ws-team', personal: false },
    { id: 'ws-personal', personal: true },
  ];

  it('prefers the mailbox workspace', () => {
    expect(
      defaultContactWorkspaceId({
        mailboxWorkspaceId: 'ws-team',
        routeWorkspaceId: 'personal',
        workspaces,
      })
    ).toBe('ws-team');
  });

  it('maps the personal route to the personal workspace', () => {
    expect(
      defaultContactWorkspaceId({ routeWorkspaceId: 'personal', workspaces })
    ).toBe('ws-personal');
    expect(defaultContactWorkspaceId({ routeWorkspaceId: 'personal' })).toBe(
      'personal'
    );
    expect(
      defaultContactWorkspaceId({
        mailboxWorkspaceId: null,
        routeWorkspaceId: 'ws-team',
        workspaces,
      })
    ).toBe('ws-team');
  });
});
