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

  it('reopens on the tagged entry when Forward follows Back', async () => {
    const address = await loadAddress();
    const settled = () =>
      new Promise<void>((resolve) =>
        window.addEventListener('popstate', () => resolve(), { once: true })
      );
    window.history.replaceState(null, '', '/ws/tasks');
    window.history.pushState(null, '', '/ws/tasks?settingsDialog=open');
    address.enterPublicProfileAddress('/u/creator');

    let done = settled();
    window.history.back();
    await done;
    expect(window.location.pathname).toBe('/ws/tasks');
    expect(address.isPublicProfileAddressActive()).toBe(false);

    done = settled();
    window.history.forward();
    await done;
    expect(window.location.pathname).toBe('/u/creator');
    expect(address.isPublicProfileAddressActive()).toBe(true);

    address.leavePublicProfileAddress();
    expect(`${window.location.pathname}${window.location.search}`).toBe(
      '/ws/tasks?settingsDialog=open'
    );
    expect(address.isPublicProfileAddressActive()).toBe(false);
  });

  it('keeps an earlier page load tag inert after Forward', async () => {
    const first = await loadAddress();
    window.history.replaceState(null, '', '/ws/tasks');
    window.history.pushState(null, '', '/ws/tasks?settingsDialog=open');
    first.enterPublicProfileAddress('/u/creator');
    window.history.back();
    await new Promise<void>((resolve) =>
      window.addEventListener('popstate', () => resolve(), { once: true })
    );
    const reloaded = await loadAddress();
    window.history.forward();
    await new Promise<void>((resolve) =>
      window.addEventListener('popstate', () => resolve(), { once: true })
    );
    expect(window.location.pathname).toBe('/u/creator');
    expect(reloaded.isPublicProfileAddressActive()).toBe(false);
  });
});
