// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { missingRequiredBindings } from '../../cloudflare/required-bindings';

const complete = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable',
  SUPABASE_SECRET_KEY: 'secret',
  TUTURUUU_APP_COORDINATION_SECRET: 'coordination',
};

describe('Drive Worker deploy gate', () => {
  it('runs outside a production build (vitest sets NODE_ENV=test)', () => {
    expect(process.env.NODE_ENV).not.toBe('production');
  });

  it('refuses outside a production build even with every binding set', () => {
    // The Worker tests mock this gate; it must still refuse here.
    expect(missingRequiredBindings(complete)).toBe(true);
  });

  it('refuses when bindings are absent', () => {
    expect(missingRequiredBindings({})).toBe(true);
  });
});
