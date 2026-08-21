import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  TaskSubmenuProvider,
  useTaskSubmenuController,
} from '../task-submenu-controller';

describe('TaskSubmenuProvider', () => {
  it('closes the previous submenu before opening a keyboard-selected sibling', () => {
    const onActiveIdChange = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TaskSubmenuProvider onActiveIdChange={onActiveIdChange}>
        {children}
      </TaskSubmenuProvider>
    );
    const { result } = renderHook(() => useTaskSubmenuController(), {
      wrapper,
    });

    act(() => result.current.setSubmenuOpen('labels', true));
    expect(result.current.activeId).toBe('labels');

    act(() => result.current.setSubmenuOpen('projects', true));
    expect(result.current.activeId).toBe('projects');
    expect(result.current.isSubmenuOpen('labels')).toBe(false);
    expect(result.current.isSubmenuOpen('projects')).toBe(true);
    expect(onActiveIdChange).toHaveBeenLastCalledWith('projects');
  });

  it('does not let a stale close event dismiss the newly opened submenu', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TaskSubmenuProvider>{children}</TaskSubmenuProvider>
    );
    const { result } = renderHook(() => useTaskSubmenuController(), {
      wrapper,
    });

    act(() => {
      result.current.setSubmenuOpen('labels', true);
      result.current.setSubmenuOpen('projects', true);
      result.current.setSubmenuOpen('labels', false);
    });

    expect(result.current.activeId).toBe('projects');
  });
});
