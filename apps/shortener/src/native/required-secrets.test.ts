// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  missingSecretsResponse,
  SHORTENER_REQUIRED_SECRETS,
} from './required-secrets';

const complete = {
  SHORTENER_CANONICAL_HOST_ENABLED: '1',
  ...Object.fromEntries(
    SHORTENER_REQUIRED_SECRETS.map((name) => [name, 'fixture'])
  ),
};
const blanks = [undefined, '', '   '];

describe('Shortener required secrets', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serves when production has every secret', () => {
    expect(missingSecretsResponse(complete)).toBeNull();
  });

  it.each(blanks)('refuses to serve with a blank secret: %j', async (value) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = missingSecretsResponse({
      ...complete,
      SUPABASE_SECRET_KEY: value,
    });
    expect(response?.status).toBe(503);
    expect(await response?.text()).not.toContain('SUPABASE_SECRET_KEY');
    expect(error.mock.calls.flat().join()).toContain('SUPABASE_SECRET_KEY');
  });

  it('never logs a value', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    missingSecretsResponse({
      ...complete,
      SUPABASE_SECRET_KEY: '',
      NEXT_PUBLIC_SUPABASE_URL: 'value-must-stay-private',
    });
    expect(error.mock.calls.flat().join()).not.toContain('value-must-stay');
  });

  it('leaves the fenced staging profile alone', () => {
    expect(missingSecretsResponse({})).toBeNull();
  });
});
