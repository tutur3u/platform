import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSidebarCookieOptions,
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME,
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
    <div>
      <button type="button" onClick={() => handleBehaviorChange('collapsed')}>
        {behavior}
      </button>
      <input aria-label="editable target" />
    </div>
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
      getSidebarCookieOptions()
    );
    expect(mockSetCookie).toHaveBeenCalledWith(
      SIDEBAR_BEHAVIOR_UPDATED_AT_COOKIE_NAME,
      '1234567890',
      getSidebarCookieOptions()
    );
  });

  it('toggles expanded and collapsed with Cmd/Ctrl+B', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_234_567_891);

    render(
      <SidebarProvider initialBehavior="expanded">
        <SidebarHarness />
      </SidebarProvider>
    );

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'collapsed' })).toBeVisible()
    );
    expect(mockSetCookie).toHaveBeenCalledWith(
      SIDEBAR_BEHAVIOR_COOKIE_NAME,
      'collapsed',
      getSidebarCookieOptions()
    );

    fireEvent.keyDown(window, { key: 'b', metaKey: true });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'expanded' })).toBeVisible()
    );
  });

  it('hides the sidebar with Cmd/Ctrl+Alt+B', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_234_567_892);

    render(
      <SidebarProvider initialBehavior="expanded">
        <SidebarHarness />
      </SidebarProvider>
    );

    fireEvent.keyDown(window, { key: 'b', altKey: true, ctrlKey: true });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'hidden' })).toBeVisible()
    );
    expect(mockSetCookie).toHaveBeenCalledWith(
      SIDEBAR_BEHAVIOR_COOKIE_NAME,
      'hidden',
      getSidebarCookieOptions()
    );
  });

  it('changes hidden to collapsed with Cmd/Ctrl+B', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_234_567_893);

    render(
      <SidebarProvider initialBehavior="hidden">
        <SidebarHarness />
      </SidebarProvider>
    );

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'collapsed' })).toBeVisible()
    );
  });

  it('ignores sidebar hotkeys from editable targets', () => {
    render(
      <SidebarProvider initialBehavior="expanded">
        <SidebarHarness />
      </SidebarProvider>
    );

    fireEvent.keyDown(screen.getByLabelText('editable target'), {
      key: 'b',
      ctrlKey: true,
    });

    expect(screen.getByRole('button', { name: 'expanded' })).toBeVisible();
    expect(mockSetCookie).not.toHaveBeenCalledWith(
      SIDEBAR_BEHAVIOR_COOKIE_NAME,
      'collapsed',
      expect.anything()
    );
  });
});
