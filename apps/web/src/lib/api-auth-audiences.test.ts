import { describe, expect, it } from 'vitest';
import {
  ALL_SATELLITE_APP_SESSION_TARGETS,
  getDefaultAppSessionVerificationOptions,
} from './api-auth-audiences';

describe('shared app-session API audiences', () => {
  it('allows shared realtime identity/tickets across satellites while keeping checkpoints service-only', () => {
    for (const path of [
      '/api/v1/realtime/channels',
      '/api/v1/realtime/session',
    ]) {
      expect(getDefaultAppSessionVerificationOptions(path).targetApp).toEqual(
        ALL_SATELLITE_APP_SESSION_TARGETS
      );
    }
    expect(
      getDefaultAppSessionVerificationOptions(
        '/api/v1/realtime/documents/checkpoint'
      ).targetApp
    ).toBe('platform');
  });
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
        'lettin',
        'hive',
        'infra',
        'inventory',
        'learn',
        'mail',
        'meet',
        'parley',
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
  it('adds Git only to Hidden discovery and mutation audience', () => {
    expect(
      getDefaultAppSessionVerificationOptions(
        '/api/v1/users/me/hidden-workspaces'
      ).targetApp
    ).toContain('git');
    expect(
      getDefaultAppSessionVerificationOptions('/api/v1/users/me/profile')
        .targetApp
    ).not.toContain('git');
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
