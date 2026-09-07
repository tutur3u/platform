import { describe, expect, it } from 'vitest';
import { getDefaultAppSessionVerificationOptions } from './api-auth-audiences';

describe('shared app-session API audiences', () => {
  it('includes Meet in current-user API access', () => {
    expect(
      getDefaultAppSessionVerificationOptions(
        'http://localhost:3000/api/v1/users/me/profile'
      )
    ).toEqual({
      targetApp: [
        'ai',
        'calendar',
        'chat',
        'cms',
        'contacts',
        'drive',
        'finance',
        'forms',
        'hive',
        'infra',
        'inventory',
        'learn',
        'mail',
        'meet',
        'mind',
        'mira',
        'nova',
        'pay',
        'rewise',
        'storefront',
        'tasks',
        'teach',
        'track',
      ],
    });
  });
  it('allows Meet user settings without widening unrelated APIs', () => {
    expect(
      getDefaultAppSessionVerificationOptions(
        '/api/v1/users/me/configs/SHOW_VERSION_BADGE'
      ).targetApp
    ).toContain('meet');
    expect(
      getDefaultAppSessionVerificationOptions('/api/v1/admin/secrets').targetApp
    ).toBe('platform');
    expect(
      getDefaultAppSessionVerificationOptions(
        '/api/v1/workspaces/ws-1/mail/bootstrap'
      ).targetApp
    ).toBe('mail');
  });
});
