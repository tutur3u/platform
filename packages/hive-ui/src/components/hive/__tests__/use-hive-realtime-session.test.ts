import { describe, expect, it } from 'vitest';
import {
  createHiveAwareness,
  getHivePresenceDisplayName,
} from '../use-hive-realtime-session';

describe('Hive realtime awareness', () => {
  it('does not use account email as the public presence display name', () => {
    expect(
      getHivePresenceDisplayName({
        email: 'private@example.com',
        id: '00000000-0000-4000-8000-000000000001',
      })
    ).toBe('Hive researcher');

    const awareness = createHiveAwareness({
      currentUser: {
        displayName: '   ',
        email: 'private@example.com',
        handle: null,
        id: '00000000-0000-4000-8000-000000000001',
      },
      npcs: [],
      selectedServer: null,
      selection: null,
      tool: 'select',
    });

    expect(awareness.displayName).toBe('Hive researcher');
    expect(awareness.displayName).not.toContain('@');
  });

  it('prefers configured profile names and handles for public presence', () => {
    expect(
      getHivePresenceDisplayName({
        displayName: ' Local Researcher ',
        email: 'private@example.com',
        id: '00000000-0000-4000-8000-000000000001',
      })
    ).toBe('Local Researcher');

    expect(
      getHivePresenceDisplayName({
        displayName: null,
        email: 'private@example.com',
        handle: 'hive-builder',
        id: '00000000-0000-4000-8000-000000000001',
      })
    ).toBe('hive-builder');
  });
});
