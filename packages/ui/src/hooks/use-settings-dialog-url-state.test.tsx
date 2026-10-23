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
