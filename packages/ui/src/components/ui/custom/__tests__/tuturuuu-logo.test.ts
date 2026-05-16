import { describe, expect, it } from 'vitest';
import { TUTURUUU_LOGO_URL } from '../tuturuuu-logo';

describe('Tuturuuu logo asset URL', () => {
  it('uses the canonical hosted logo instead of a per-app relative asset', () => {
    expect(TUTURUUU_LOGO_URL).toBe(
      'https://tuturuuu.com/media/logos/transparent.png'
    );
  });
});
