import { describe, expect, it } from 'vitest';
import { meetRealtimeClientMessageSchema } from './messages';
import {
  lobbyDisplayName,
  normalizeDisplayNameText,
} from './room-display-name';

const SUFFIX = ' (guest)';

describe('lobby display name normalisation', () => {
  it.each([
    ['ASCII padding', `Host Name${' '.repeat(100)}x`],
    ['line separator', `Host Name   x`],
    ['paragraph separator', `Host Name x`],
    ['ideographic space', `Host Name${'　'.repeat(100)}x`],
    ['no-break and thin spaces', `Host Name   x`],
    ['tabs and newlines', 'Host Name\t\n\r x'],
  ])('collapses %s to one space', (_label, raw) => {
    expect(normalizeDisplayNameText(raw)).toBe('Host Name x');
    expect(lobbyDisplayName(raw)).toBe(`Host Name x${SUFFIX}`);
  });

  it('keeps the guest suffix adjacent when padding trails the name', () => {
    const name = lobbyDisplayName(`Host Name${'　'.repeat(200)}`);
    expect(name).toBe(`Host Name${SUFFIX}`);
  });

  it('caps at 120 including the suffix without a dangling space', () => {
    const name = lobbyDisplayName(`${'a'.repeat(111)} ${'b'.repeat(50)}`);
    expect(name.length).toBeLessThanOrEqual(120);
    expect(name.endsWith(SUFFIX)).toBe(true);
    expect(name).not.toMatch(/\s\s/);
  });

  it('strips bidi and control characters before collapsing', () => {
    expect(lobbyDisplayName('Host‮ ​ Name')).toBe(`Host Name${SUFFIX}`);
  });

  it('normalises the presence.join schema the same way', () => {
    const parsed = meetRealtimeClientMessageSchema.safeParse({
      type: 'presence.join',
      displayName: `Host${'　'.repeat(50)}Name `,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'presence.join')
      expect(parsed.data.displayName).toBe('Host Name');
  });
});
