import { Inbox } from '@tuturuuu/icons';
import { describe, expect, it } from 'vitest';
import { NAV, type NavEntry, navFor } from './shell';

describe('navFor', () => {
  it('shows owners every entry', () => {
    expect(navFor('owner')).toEqual([...NAV]);
  });

  it('shows fleet grantees only the entries that opt in', () => {
    expect(navFor('fleet').map((entry) => entry.id)).toEqual(['fleet-access']);
    const entries: NavEntry[] = [
      ...NAV.filter((entry) => entry.id !== 'fleet-access'),
      {
        id: 'shared',
        label: 'nav.inbox',
        icon: Inbox,
        scopes: ['owner', 'fleet'],
      },
    ];
    expect(navFor('fleet', entries).map((entry) => entry.id)).toEqual([
      'shared',
    ]);
    expect(navFor('owner', entries)).toHaveLength(NAV.length);
  });

  it('hides a fleet-only entry from owners', () => {
    const entries: NavEntry[] = [
      { id: 'grantee', label: 'nav.inbox', icon: Inbox, scopes: ['fleet'] },
    ];
    expect(navFor('owner', entries)).toEqual([]);
    expect(navFor('fleet', entries)).toHaveLength(1);
  });
});
