import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME,
  SIDEBAR_COOKIE_OPTIONS,
  SidebarProvider,
  useSidebar,
} from '../sidebar-context';

const { mockSetCookie } = vi.hoisted(() => ({
  mockSetCookie: vi.fn(),
}));

vi.mock('cookies-next', () => ({
  setCookie: mockSetCookie,
}));

vi.mock('../sidebar-remote-behavior-bridge', () => ({
  SidebarRemoteBehaviorBridge: () => null,
}));

function SidebarHarness() {
  const { behavior, handleBehaviorChange } = useSidebar();

  return (
    <button type="button" onClick={() => handleBehaviorChange('collapsed')}>
      {behavior}
    </button>
  );
}

describe('SidebarProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockSetCookie.mockClear();
  });

  it('writes durable behavior and timestamp cookies for user behavior changes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_234_567_890);

    render(
      <SidebarProvider initialBehavior="expanded">
        <SidebarHarness />
      </SidebarProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'expanded' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'collapsed' })).toBeVisible()
    );
    expect(mockSetCookie).toHaveBeenCalledWith(
      SIDEBAR_BEHAVIOR_COOKIE_NAME,
      'collapsed',
      SIDEBAR_COOKIE_OPTIONS
    );
    expect(mockSetCookie).toHaveBeenCalledWith(
      SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME,
      '1234567890',
      SIDEBAR_COOKIE_OPTIONS
    );
  });
});
