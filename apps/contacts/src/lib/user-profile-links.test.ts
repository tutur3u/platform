import { describe, expect, it } from 'vitest';
import { buildExternalUserProfileUrl } from './user-profile-links';

describe('buildExternalUserProfileUrl', () => {
  it('builds share links on the public web app origin', () => {
    expect(
      buildExternalUserProfileUrl(
        'profile code',
        'https://platform.example.com/base'
      )
    ).toBe('https://platform.example.com/shared/user-profile/profile%20code');
  });
});
