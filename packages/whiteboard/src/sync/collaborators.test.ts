import { describe, expect, it } from 'vitest';
import {
  buildCollaborators,
  getCollaboratorColor,
  pruneStaleEntries,
} from './collaborators';

describe('getCollaboratorColor', () => {
  it('is stable for a user and always a palette color', () => {
    expect(getCollaboratorColor('user-1')).toBe(getCollaboratorColor('user-1'));
    expect(getCollaboratorColor('user-1')).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe('buildCollaborators', () => {
  const cursors = new Map([['u1', { x: 1, y: 2, tool: 'laser' }]]);
  const selections = new Map([['u2', { el: true as const }]]);

  it('lists the presence roster and attaches cursors and selections', () => {
    const result = buildCollaborators({
      presence: [
        { id: 'u1', displayName: 'Ada' },
        { id: 'u2', displayName: 'Bo', avatarUrl: 'https://img/bo.png' },
      ],
      cursors,
      selections,
    });

    expect([...result.keys()]).toEqual(['u1', 'u2']);
    expect(result.get('u1' as never)).toMatchObject({
      username: 'Ada',
      pointer: { x: 1, y: 2, tool: 'laser' },
    });
    expect(result.get('u2' as never)).toMatchObject({
      username: 'Bo',
      avatarUrl: 'https://img/bo.png',
      selectedElementIds: { el: true },
    });
  });

  it('falls back to anyone with a cursor or selection when there is no roster', () => {
    const result = buildCollaborators({ cursors, selections });

    expect([...result.keys()].sort()).toEqual(['u1', 'u2']);
    expect(result.get('u1' as never)?.username).toBe('Collaborator');
  });

  it('shows nobody for an empty roster even if cursors linger', () => {
    expect(buildCollaborators({ presence: [], cursors, selections }).size).toBe(
      0
    );
  });
});

describe('pruneStaleEntries', () => {
  const at = (lastUpdatedAt: number) => ({ lastUpdatedAt });

  it('returns the same map when nothing is stale', () => {
    const map = new Map([['a', at(1000)]]);

    expect(pruneStaleEntries(map, 2000, 5000, (e) => e.lastUpdatedAt)).toBe(
      map
    );
  });

  it('drops only entries older than the timeout', () => {
    const map = new Map([
      ['old', at(0)],
      ['fresh', at(9000)],
    ]);
    const result = pruneStaleEntries(map, 10000, 5000, (e) => e.lastUpdatedAt);

    expect([...result.keys()]).toEqual(['fresh']);
    expect(map.size).toBe(2);
  });
});
