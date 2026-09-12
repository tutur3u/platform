import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  MiraWorkspaceProvider,
  useMiraWorkspace,
} from './mira-workspace-state';

describe('Mira artifact workspace', () => {
  it('updates presentation without resetting layout, focuses a panel, and returns to full chat', () => {
    const { result } = renderHook(useMiraWorkspace, {
      wrapper: MiraWorkspaceProvider,
    });
    act(() => {
      result.current?.open('tasks', 'one', 'vertical');
      result.current?.open('finance', 'one');
    });
    act(() =>
      result.current?.open('tasks', 'one', undefined, {
        title: 'Priority work',
        taskStatus: 'overdue',
      })
    );
    expect(result.current?.layout).toBe('vertical');
    expect(
      result.current?.artifacts.find((item) => item.kind === 'tasks')
        ?.presentation?.title
    ).toBe('Priority work');
    act(() => result.current?.focus('tasks', 'one'));
    expect(result.current?.artifacts).toHaveLength(1);
    expect(result.current?.artifacts[0]?.presentation?.title).toBe(
      'Priority work'
    );
    act(() => result.current?.closeAll());
    expect(result.current?.artifacts).toEqual([]);
    expect(result.current?.layout).toBe('auto');
  });
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

it('does not open a missing artifact when asked to focus it', () => {
  const { result } = renderHook(useMiraWorkspace, {
    wrapper: MiraWorkspaceProvider,
  });
  act(() => result.current?.open('tasks', 'one', 'vertical'));
  act(() => result.current?.focus('finance', 'one'));
  expect(result.current?.artifacts.map((item) => item.kind)).toEqual(['tasks']);
  expect(result.current?.layout).toBe('vertical');
});

it('applies batched open, close, and focus actions in tool order', () => {
  const { result } = renderHook(useMiraWorkspace, {
    wrapper: MiraWorkspaceProvider,
  });
  act(() => {
    result.current?.open('tasks', 'one', 'grid');
    result.current?.open('finance', 'one');
    result.current?.focus('finance', 'one');
  });
  expect(result.current?.artifacts.map((item) => item.kind)).toEqual([
    'finance',
  ]);
  expect(result.current?.layout).toBe('auto');
  act(() => {
    result.current?.close('finance', 'one');
    result.current?.focus('finance', 'one');
  });
  expect(result.current?.artifacts).toEqual([]);
});
