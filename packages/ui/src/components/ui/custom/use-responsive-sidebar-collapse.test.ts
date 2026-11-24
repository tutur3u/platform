import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResponsiveSidebarCollapse } from './use-responsive-sidebar-collapse';

let mobile = false;
const listeners = new Set<() => void>();

beforeEach(() => {
  mobile = false;
  listeners.clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return mobile;
      },
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
    }))
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('useResponsiveSidebarCollapse', () => {
  it('starts the phone drawer closed even when desktop is expanded', () => {
    mobile = true;
    const { result } = renderHook(() => useResponsiveSidebarCollapse(false));
    expect(result.current.mobileSidebarOpen).toBe(false);
    expect(result.current.isCollapsed).toBe(true);

    act(() => result.current.toggleMobileSidebar());
    expect(result.current.mobileSidebarOpen).toBe(true);
    expect(result.current.isCollapsed).toBe(false);

    act(() => result.current.setIsCollapsed(true));
    expect(result.current.mobileSidebarOpen).toBe(false);
  });

  it('keeps the persisted desktop state and leaves it alone on phones', () => {
    const { result } = renderHook(() => useResponsiveSidebarCollapse(false));
    expect(result.current.isCollapsed).toBe(false);
    expect(result.current.mobileSidebarOpen).toBe(false);

    act(() => result.current.setIsCollapsed(true));
    expect(result.current.isCollapsed).toBe(true);

    act(() => {
      mobile = true;
      for (const listener of listeners) listener();
    });
    expect(result.current.isCollapsed).toBe(true);
    act(() => result.current.toggleMobileSidebar());
    act(() => {
      mobile = false;
      for (const listener of listeners) listener();
    });
    expect(result.current.isCollapsed).toBe(true);
  });

  it('starts a collapsed desktop collapsed', () => {
    const { result } = renderHook(() => useResponsiveSidebarCollapse(true));
    expect(result.current.isCollapsed).toBe(true);
  });
});
