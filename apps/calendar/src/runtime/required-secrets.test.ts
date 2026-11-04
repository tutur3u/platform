import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CALENDAR_REQUIRED_SECRETS,
  missingCalendarSecrets,
  missingSecretsResponse,
} from './required-secrets';

const complete = Object.fromEntries(
  CALENDAR_REQUIRED_SECRETS.map((name) => [name, 'fixture'])
);

const blanks = [undefined, '', '   '];

describe('Calendar required secrets', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serves only when every secret has a value', () => {
    expect(missingCalendarSecrets(complete)).toEqual([]);
    expect(missingSecretsResponse('production', complete)).toBeNull();
  });

  it.each(blanks)('refuses to serve with a blank secret: %j', async (value) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = { ...complete, ENCRYPTION_MASTER_KEY: value };
    for (const profile of ['production', 'staging']) {
      const response = missingSecretsResponse(profile, env);
      expect(response?.status).toBe(503);
      expect(await response?.text()).not.toContain('ENCRYPTION_MASTER_KEY');
    }
    expect(error.mock.calls.flat().join()).toContain('ENCRYPTION_MASTER_KEY');
  });

  it('never logs a value', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    missingSecretsResponse('production', {
      ...complete,
      CRON_SECRET: '',
      SUPABASE_SECRET_KEY: 'value-must-stay-private',
    });
    expect(error.mock.calls.flat().join()).not.toContain('value-must-stay');
  });

  it('leaves local development alone', () => {
    expect(missingSecretsResponse('development', {})).toBeNull();
  });
});
