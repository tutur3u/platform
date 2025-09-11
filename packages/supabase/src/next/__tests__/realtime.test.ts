import { describe, expect, it } from 'vitest';
import type { RealtimePresenceState } from '../realtime';

describe('realtime', () => {
  it('should export RealtimePresenceState type', () => {
    // This is a type test - we're just checking that the type is exported correctly
    // The actual test is that the code compiles, so we just need a basic assertion to satisfy vitest
    const typeCheck = true; // We can only verify at compile time
    expect(typeCheck).toBe(true);

    // Sample usage to verify TypeScript doesn't complain - won't be executed
    const samplePresence: RealtimePresenceState = {
      '1234': [
        {
          presence_ref: 'ref123',
        },
      ],
    };
    expect(typeof samplePresence).toBe('object');
  });
});
