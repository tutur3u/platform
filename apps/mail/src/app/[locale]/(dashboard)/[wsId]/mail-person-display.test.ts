import type { ResolvedWorkspacePerson } from '@tuturuuu/internal-api/people';
import { describe, expect, it } from 'vitest';
import {
  collapseMailRecipients,
  mailAddressDomain,
  mailPersonDisplayName,
  mailPersonEmailVisible,
} from './mail-person-display';

const hiddenMember: ResolvedWorkspacePerson = {
  email: 'sam@example.com',
  kind: 'member',
  id: 'member-1',
  displayName: null,
  avatarUrl: null,
  emailVisible: false,
};

describe('collapseMailRecipients', () => {
  it('keeps two names and counts the rest', () => {
    expect(collapseMailRecipients(['A', 'B', 'C', 'D'])).toEqual({
      visible: ['A', 'B'],
      hidden: 2,
    });
  });

  it('shows short lists in full', () => {
    expect(collapseMailRecipients(['A'])).toEqual({
      visible: ['A'],
      hidden: 0,
    });
    expect(collapseMailRecipients([])).toEqual({ visible: [], hidden: 0 });
  });

  it('honours a custom limit', () => {
    expect(collapseMailRecipients(['A', 'B', 'C'], 1).hidden).toBe(2);
  });
});

describe('mailPersonDisplayName', () => {
  it('prefers the workspace identity over the header name', () => {
    expect(
      mailPersonDisplayName(
        { ...hiddenMember, displayName: 'Sam Ton', emailVisible: true },
        'sam (work)',
        'sam@example.com',
        'Member'
      )
    ).toBe('Sam Ton');
  });

  it('never falls back to an address the workspace hides', () => {
    expect(mailPersonEmailVisible(hiddenMember)).toBe(false);
    expect(
      mailPersonDisplayName(hiddenMember, null, 'sam@example.com', 'Member')
    ).toBe('Member');
    expect(
      mailPersonDisplayName(hiddenMember, ' Sam ', 'sam@example.com', 'Member')
    ).toBe('Sam');
  });

  it('keeps unknown senders as their header name or address', () => {
    const unknown: ResolvedWorkspacePerson = {
      email: 'news@topcv.vn',
      kind: 'unknown',
      displayName: null,
      avatarUrl: null,
    };
    expect(mailPersonDisplayName(unknown, null, 'news@topcv.vn', 'M')).toBe(
      'news@topcv.vn'
    );
    expect(
      mailPersonDisplayName(undefined, 'TopCV', 'news@topcv.vn', 'M')
    ).toBe('TopCV');
  });
});

it('extracts a lowercase domain', () => {
  expect(mailAddressDomain('Team@SePay.VN')).toBe('sepay.vn');
  expect(mailAddressDomain('no-domain')).toBe('');
});
