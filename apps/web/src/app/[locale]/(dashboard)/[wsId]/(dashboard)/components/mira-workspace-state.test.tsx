import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  MiraWorkspaceProvider,
  useMiraWorkspace,
} from './mira-workspace-state';

describe('Mira artifact workspace', () => {
  it('deduplicates panels, bounds the grid to three artifacts, and closes only the matching workspace', () => {
    const { result } = renderHook(useMiraWorkspace, {
      wrapper: MiraWorkspaceProvider,
    });
    act(() => {
      result.current?.open('tasks', 'one');
      result.current?.open('tasks', 'one');
    });
    expect(result.current?.artifacts).toHaveLength(1);
    act(() => {
      result.current?.open('calendar', 'one');
      result.current?.open('tasks', 'two');
      result.current?.open('meetings', 'one', 'grid');
    });
    expect(result.current?.artifacts).toHaveLength(3);
    expect(result.current?.layout).toBe('grid');
    act(() => result.current?.close('tasks', 'one'));
    expect(result.current?.artifacts).toHaveLength(3);
    act(() => result.current?.close('tasks', 'two'));
    expect(result.current?.artifacts).toHaveLength(2);
  });
});
