import { describe, expect, it, vi } from 'vitest';
import {
  getCmsEntryPath,
  getCmsLibraryPath,
  replaceCmsDialogHistoryPath,
} from './cms-paths';

describe('CMS dialog history paths', () => {
  it('replaces the current URL without starting a route navigation', () => {
    const replaceState = vi.fn();
    const state = { existing: 'state' };
    const history = { replaceState, state };

    replaceCmsDialogHistoryPath(
      history,
      getCmsEntryPath('/workspace/content', 'entry-1')
    );

    expect(replaceState).toHaveBeenCalledOnce();
    expect(replaceState).toHaveBeenCalledWith(
      state,
      '',
      '/workspace/content?entryId=entry-1'
    );
  });

  it('restores the library path with the same history state', () => {
    const replaceState = vi.fn();
    const state = { existing: 'state' };
    const history = { replaceState, state };

    replaceCmsDialogHistoryPath(
      history,
      getCmsLibraryPath('/workspace/content')
    );

    expect(replaceState).toHaveBeenCalledWith(state, '', '/workspace/content');
  });
});
