// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  bindRequestAppToken,
  getRequestVerifiedUser,
  peekRequestVerifiedUser,
} from '../request-verified-user';

const user = { id: 'actor' } as never;
const ok = () => vi.fn(async () => ({ data: { user }, error: null }));

describe('request-scoped verified user memo', () => {
  it('shares one lookup per request and credential', async () => {
    const request = {};
    const lookup = ok();
    await getRequestVerifiedUser(request, 'eyJa', lookup);
    await getRequestVerifiedUser(request, 'eyJa', lookup);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(peekRequestVerifiedUser(request, 'eyJa')).toBe(user);
  });

  it('never shares a lookup across request objects', async () => {
    const lookup = ok();
    await getRequestVerifiedUser({}, 'eyJa', lookup);
    await getRequestVerifiedUser({}, 'eyJa', lookup);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('invalidates when the credential changes', async () => {
    const request = {};
    const lookup = ok();
    await getRequestVerifiedUser(request, 'eyJa', lookup);
    await getRequestVerifiedUser(request, 'eyJb', lookup);
    await getRequestVerifiedUser(request, 'eyJa', lookup);
    expect(lookup).toHaveBeenCalledTimes(3);
    expect(peekRequestVerifiedUser(request, 'eyJb')).toBeNull();
  });

  it('evicts rejected, errored and empty lookups', async () => {
    const request = {};
    const failures = [
      () => Promise.reject(new Error('down')),
      async () => ({ data: { user: null }, error: { code: 'bad_jwt' } }),
      async () => ({ data: { user: null }, error: null }),
    ];
    for (const failure of failures) {
      await getRequestVerifiedUser(request, 'eyJa', failure).catch(() => null);
      expect(peekRequestVerifiedUser(request, 'eyJa')).toBeNull();
    }
    const retry = ok();
    expect(
      (await getRequestVerifiedUser(request, 'eyJa', retry)).data.user
    ).toBe(user);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('binds a minted app token only to a successful lookup of its principal', async () => {
    const request = {};
    await getRequestVerifiedUser(request, 'eyJa', ok());
    bindRequestAppToken(request, 'ttr_app_other', 'someone-else');
    bindRequestAppToken(request, 'ttr_app_minted', 'actor');
    const lookup = ok();
    await getRequestVerifiedUser(request, 'ttr_app_minted', lookup);
    expect(lookup).not.toHaveBeenCalled();
    await getRequestVerifiedUser(request, 'ttr_app_other', lookup);
    expect(lookup).toHaveBeenCalledTimes(1);

    const failed = {};
    await getRequestVerifiedUser(failed, 'eyJa', async () => ({
      data: { user: null },
      error: { code: 'bad_jwt' },
    }));
    bindRequestAppToken(failed, 'ttr_app_minted', 'actor');
    const fresh = ok();
    await getRequestVerifiedUser(failed, 'ttr_app_minted', fresh);
    expect(fresh).toHaveBeenCalledTimes(1);
  });
});
