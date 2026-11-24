import { act, renderHook, waitFor } from '@testing-library/react';
import {
  type OnUrlUpdateFunction,
  withNuqsTestingAdapter,
} from 'nuqs/adapters/testing';
import { describe, expect, it, vi } from 'vitest';
import { useSettingsDialogUrlState } from './use-settings-dialog-url-state';

function renderUrlState(searchParams: string, onUrlUpdate = vi.fn()) {
  return renderHook(() => useSettingsDialogUrlState(['settingsBoardId']), {
    wrapper: withNuqsTestingAdapter({
      onUrlUpdate: onUrlUpdate as OnUrlUpdateFunction,
      searchParams,
    }),
  });
}

describe('useSettingsDialogUrlState', () => {
  it('opens a bare ?settingsTab deep link', () => {
    const { result } = renderUrlState('?settingsTab=security');
    expect(result.current.open).toBe(true);
    expect(result.current.tab).toBe('security');
  });

  it('pushes the open state with the tab and host extras', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    const { result } = renderUrlState('?view=list', onUrlUpdate);
    expect(result.current.open).toBe(false);

    act(() =>
      result.current.openSettings('task_board', { settingsBoardId: 'b1' })
    );

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const update = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(update?.options.history).toBe('push');
    expect(update?.searchParams.get('view')).toBe('list');
    expect(update?.searchParams.get('settingsDialog')).toBe('open');
    expect(update?.searchParams.get('settingsTab')).toBe('task_board');
    expect(update?.searchParams.get('settingsBoardId')).toBe('b1');
    expect(result.current.open).toBe(true);
    expect(result.current.extras.settingsBoardId).toBe('b1');
  });

  it('replaces history when switching tabs and clears every param on close', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    const { result } = renderUrlState(
      '?settingsDialog=open&settingsTab=profile&settingsBoardId=b1',
      onUrlUpdate
    );

    act(() => result.current.openSettings('security'));
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(1));
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].options.history).toBe('replace');
    expect(result.current.extras.settingsBoardId).toBeNull();

    act(() => result.current.closeSettings());
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(2));
    const update = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(update?.options.history).toBe('replace');
    expect(update?.queryString).toBe('');
    expect(result.current.open).toBe(false);
  });
});

describe('useSettingsDialogUrlState with the public profile address', () => {
  it('reports the Public profile tab while /u/<name> is shown and restores the address before switching tabs', async () => {
    const address = await import('./public-profile-address.js');
    window.history.replaceState(
      null,
      '',
      '/ws?settingsDialog=open&settingsTab=public_profile'
    );
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    const { result } = renderUrlState('', onUrlUpdate);
    expect(result.current.open).toBe(false);

    act(() => {
      address.enterPublicProfileAddress('/u/creator');
    });
    expect(window.location.pathname).toBe('/u/creator');
    expect(result.current.open).toBe(true);
    expect(result.current.tab).toBe('public_profile');

    act(() => result.current.openSettings('security'));
    expect(window.location.pathname).toBe('/ws');
    expect(address.isPublicProfileAddressActive()).toBe(false);
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].options.history).toBe('replace');
  });
});

describe('one account dialog at a time', () => {
  it('closes Upgrade when Settings opens', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    const { result } = renderUrlState(
      '?upgradeDialog=open&upgradeTab=compare',
      onUrlUpdate
    );
    act(() => result.current.openSettings('security'));
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const update = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(update?.searchParams.get('settingsTab')).toBe('security');
    expect(update?.searchParams.has('upgradeDialog')).toBe(false);
    expect(update?.searchParams.has('upgradeTab')).toBe(false);
  });

  it('closes Settings when Upgrade opens', async () => {
    const { useUpgradeDialogUrlState } =
      await import('./use-upgrade-dialog-url-state.js');
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
    const { result } = renderHook(() => useUpgradeDialogUrlState(), {
      wrapper: withNuqsTestingAdapter({
        onUrlUpdate,
        searchParams:
          '?settingsDialog=open&settingsTab=workspace_members&settingsMembersTab=roles',
      }),
    });
    act(() => result.current.openUpgrade('current'));
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const update = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(update?.searchParams.get('upgradeDialog')).toBe('open');
    expect(update?.searchParams.get('upgradeTab')).toBe('current');
    for (const key of ['settingsDialog', 'settingsTab', 'settingsMembersTab'])
      expect(update?.searchParams.has(key)).toBe(false);
  });
});
