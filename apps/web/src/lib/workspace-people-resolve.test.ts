import { describe, expect, it } from 'vitest';
import {
  exactEmailPattern,
  parsePeopleResolve,
  projectResolvedPeople,
} from './workspace-people-resolve';

const open = {
  hideName: false,
  hideEmail: false,
  publicContacts: true,
  privateContacts: true,
};
const member = {
  kind: 'member' as const,
  id: 'm1',
  display_name: 'Tâm Nguyễn',
  email: 'Tam@Tuturuuu.com',
  avatar_url: 'https://example.com/tam.png',
};
const contact = {
  kind: 'contact' as const,
  id: 'c1',
  display_name: null,
  full_name: 'Team SePay',
  email: 'team@sepay.vn',
  avatar_url: null,
  mail_blocked: true,
};

describe('parsePeopleResolve', () => {
  it('lowercases and de-duplicates addresses', () => {
    expect(
      parsePeopleResolve({ emails: ['A@B.co', 'a@b.co', 'c@d.vn'] })
    ).toEqual(['a@b.co', 'c@d.vn']);
  });

  it('rejects empty, oversized, malformed and extra-field bodies', () => {
    expect(parsePeopleResolve({ emails: [] })).toBeNull();
    expect(
      parsePeopleResolve({
        emails: Array.from({ length: 51 }, (_, i) => `u${i}@x.vn`),
      })
    ).toBeNull();
    expect(parsePeopleResolve({ emails: ['not an email'] })).toBeNull();
    expect(parsePeopleResolve({ emails: ['a@b.co'], wsId: 'x' })).toBeNull();
    expect(parsePeopleResolve(null)).toBeNull();
  });
});

describe('exactEmailPattern', () => {
  it('escapes LIKE wildcards so a lookup matches one exact address', () => {
    expect(exactEmailPattern('a_b%c@x.vn')).toBe('"a\\_b\\%c@x.vn"');
    expect(exactEmailPattern('a"b@x.vn')).toBe('"a\\"b@x.vn"');
  });
});

describe('projectResolvedPeople', () => {
  it('returns one row per address in request order', () => {
    const rows = projectResolvedPeople(
      ['nobody@x.vn', 'tam@tuturuuu.com', 'team@sepay.vn'],
      [member, contact],
      open
    );
    expect(rows).toEqual([
      {
        email: 'nobody@x.vn',
        kind: 'unknown',
        displayName: null,
        avatarUrl: null,
      },
      {
        email: 'tam@tuturuuu.com',
        kind: 'member',
        id: 'm1',
        displayName: 'Tâm Nguyễn',
        avatarUrl: 'https://example.com/tam.png',
        emailVisible: true,
      },
      {
        email: 'team@sepay.vn',
        kind: 'contact',
        id: 'c1',
        displayName: 'Team SePay',
        avatarUrl: null,
        emailVisible: true,
        mailBlocked: true,
      },
    ]);
  });

  it('prefers a member over a contact with the same address', () => {
    const rows = projectResolvedPeople(
      ['tam@tuturuuu.com'],
      [{ ...contact, email: 'tam@tuturuuu.com' }, member],
      open
    );
    expect(rows[0]?.kind).toBe('member');
  });

  it('never confirms a member address when the workspace hides member emails', () => {
    const rows = projectResolvedPeople(['tam@tuturuuu.com'], [member], {
      ...open,
      hideEmail: true,
    });
    expect(rows).toEqual([
      {
        email: 'tam@tuturuuu.com',
        kind: 'unknown',
        displayName: null,
        avatarUrl: null,
      },
    ]);
  });

  it('withholds member names when the workspace hides them', () => {
    const [row] = projectResolvedPeople(['tam@tuturuuu.com'], [member], {
      ...open,
      hideName: true,
    });
    expect(row?.kind).toBe('member');
    expect(row?.displayName).toBeNull();
  });

  it('never matches contacts while member emails are hidden', () => {
    expect(
      projectResolvedPeople(['team@sepay.vn'], [contact], {
        ...open,
        hideEmail: true,
      })[0]?.kind
    ).toBe('unknown');
  });

  it('matches contacts only with private-info access', () => {
    expect(
      projectResolvedPeople(['team@sepay.vn'], [contact], {
        ...open,
        privateContacts: false,
      })[0]?.kind
    ).toBe('unknown');
  });

  it('hides contact names and avatars without public-info access', () => {
    const [row] = projectResolvedPeople(
      ['team@sepay.vn'],
      [{ ...contact, avatar_url: 'https://example.com/s.png' }],
      { ...open, publicContacts: false }
    );
    expect(row).toMatchObject({
      kind: 'contact',
      displayName: null,
      avatarUrl: null,
    });
  });
});
