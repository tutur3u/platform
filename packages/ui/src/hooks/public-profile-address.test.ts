import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadAddress() {
  vi.resetModules();
  return import('./public-profile-address.js');
}

beforeEach(() => {
  window.history.replaceState(null, '', '/ws/tasks?settingsDialog=open');
});
afterEach(() => vi.restoreAllMocks());

describe('public profile address', () => {
  it('shows /u/<name> on the same origin and restores the replaced address', async () => {
    const address = await loadAddress();
    const listener = vi.fn();
    const unsubscribe = address.subscribePublicProfileAddress(listener);

    expect(
      address.enterPublicProfileAddress(`${window.location.origin}/u/creator`)
    ).toBe(true);
    expect(window.location.pathname).toBe('/u/creator');
    expect(window.location.search).toBe('');
    expect(address.isPublicProfileAddressActive()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    address.leavePublicProfileAddress();
    expect(`${window.location.pathname}${window.location.search}`).toBe(
      '/ws/tasks?settingsDialog=open'
    );
    expect(address.isPublicProfileAddressActive()).toBe(false);
    expect(window.history.state).toEqual({});
    unsubscribe();
  });

  it('keeps the app address when the profile lives on another origin', async () => {
    const address = await loadAddress();
    expect(
      address.enterPublicProfileAddress('https://central.example/u/creator')
    ).toBe(false);
    expect(window.location.pathname).toBe('/ws/tasks');
    expect(address.isPublicProfileAddressActive()).toBe(false);
  });

  it('is inactive once history moves to an untagged entry', async () => {
    const address = await loadAddress();
    address.enterPublicProfileAddress('/u/creator');
    window.history.replaceState({}, '', '/ws/tasks');
    expect(address.isPublicProfileAddressActive()).toBe(false);
    address.leavePublicProfileAddress();
    expect(window.location.pathname).toBe('/ws/tasks');
  });

  it('ignores a tag that survives a reload of /u/<name>', async () => {
    const first = await loadAddress();
    first.enterPublicProfileAddress('/u/creator');
    const reloaded = await loadAddress();
    expect(reloaded.isPublicProfileAddressActive()).toBe(false);
  });
});
