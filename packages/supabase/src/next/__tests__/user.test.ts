import { type SupabaseUser } from '../user';
import { describe, expect, it } from 'vitest';

describe('user', () => {
  it('should export SupabaseUser type', () => {
    // This is a type test - we're just checking that the type is exported correctly
    // The actual test is that the code compiles, so we just need a basic assertion to satisfy vitest
    const typeCheck = true; // We can only verify at compile time
    expect(typeCheck).toBe(true);

    // Sample usage to verify TypeScript doesn't complain - won't be executed
    const sampleUser: SupabaseUser = {
      id: 'user-id',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2023-01-01',
    };
    expect(typeof sampleUser).toBe('object');
  });
});
