import { describe, expect, it } from 'vitest';
import {
  TUTURUUU_LOCAL_LOGO_URL,
  TUTURUUU_LOGO_URL,
  TUTURUUU_REMOTE_LOGO_URL,
} from '../tuturuuu-logo';

describe('Tuturuuu logo asset URL', () => {
  it('keeps the canonical hosted logo as the shared default', () => {
    expect(TUTURUUU_REMOTE_LOGO_URL).toBe(
      'https://tuturuuu.com/media/logos/transparent.png'
    );
    expect(TUTURUUU_LOGO_URL).toBe(TUTURUUU_REMOTE_LOGO_URL);
  });

  it('exports the same-origin public logo path for apps that ship the asset', () => {
    expect(TUTURUUU_LOCAL_LOGO_URL).toBe('/media/logos/transparent.png');
  });
});
