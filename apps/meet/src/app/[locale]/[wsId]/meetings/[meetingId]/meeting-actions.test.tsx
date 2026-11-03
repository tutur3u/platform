// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  toggle: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  getUserMedia: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', async () => {
  const { InternalApiError } = await import(
    '@tuturuuu/internal-api/internal-api-error'
  );
  return {
    InternalApiError,
    getWorkspaceMeetingRecordings: mocks.list,
    toggleWorkspaceMeetingRecording: mocks.toggle,
  };
});
vi.mock('next-intl', async () => {
  const messages = (await import('../../../../../../messages/en.json'))
    .default as Record<string, unknown>;
  const lookup = (path: string) =>
    path
      .split('.')
      .reduce<unknown>(
        (node, key) => (node as Record<string, unknown> | undefined)?.[key],
        messages
      );
  return {
    useTranslations: (namespace: string) => (key: string) =>
      String(lookup(`${namespace}.${key}`) ?? `${namespace}.${key}`),
  };
});
vi.mock('@tuturuuu/icons', () => ({
  Mic: () => null,
  Share2: () => null,
  Square: () => null,
}));
vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({ children, onClick, disabled }: ComponentProps<'button'>) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));
vi.mock('@tuturuuu/ui/dialog', () => {
  const Part = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div>{children}</div> : null,
    DialogContent: Part,
    DialogHeader: Part,
    DialogTitle: Part,
    DialogDescription: Part,
    DialogFooter: Part,
  };
});
vi.mock('@tuturuuu/ui/input', () => ({ Input: () => null }));
vi.mock('@tuturuuu/ui/label', () => ({ Label: () => null }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: mocks.error, success: mocks.success, info: vi.fn() },
}));

import { InternalApiError } from '@tuturuuu/internal-api';
import { MeetingActions } from './meeting-actions';

function show(canManage: boolean, active = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const session = active
    ? { id: 'session', status: 'recording', can_manage: canManage }
    : null;
  client.setQueryData(
    ['active-recording-session', 'workspace', 'meeting'],
    session
  );
  mocks.list.mockResolvedValue({ sessions: session ? [session] : [] });
  render(
    <QueryClientProvider client={client}>
      <MeetingActions wsId="workspace" meetingId="meeting" />
    </QueryClientProvider>
  );
  return client;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUserMedia.mockResolvedValue({ getTracks: () => [] });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: mocks.getUserMedia },
  });
});
afterEach(cleanup);
describe('legacy recording controls', () => {
  it('hides Stop from another member', () => {
    show(false);
    expect(screen.queryByRole('button', { name: 'End Recording' })).toBeNull();
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
  });
  it('shows Stop to the authorized creator or admin', () => {
    show(true);
    expect(screen.getByRole('button', { name: 'End Recording' })).toBeTruthy();
  });
  it('keeps the active session and shows a clear error after a 403', async () => {
    const client = show(true);
    mocks.toggle.mockRejectedValue(new InternalApiError('Forbidden', 403));
    fireEvent.click(screen.getByRole('button', { name: 'End Recording' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop Recording' }));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        expect.stringContaining('still active')
      )
    );
    expect(
      client.getQueryData(['active-recording-session', 'workspace', 'meeting'])
    ).toMatchObject({ id: 'session', status: 'recording' });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'End Recording' })).toBeTruthy();
  });
  it('clears active state only after an authorized successful stop', async () => {
    const client = show(true);
    mocks.toggle.mockResolvedValue({ action: 'stopped', sessionId: 'session' });
    fireEvent.click(screen.getByRole('button', { name: 'End Recording' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop Recording' }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(
      client.getQueryData(['active-recording-session', 'workspace', 'meeting'])
    ).toBeNull();
  });
});
describe('legacy recorder lock', () => {
  it('never offers Start Recording and points to Meet instead', async () => {
    show(true, false);
    await waitFor(() =>
      expect(screen.getByText(/old meeting recorder is retired/i)).toBeTruthy()
    );
    expect(
      screen.queryByRole('button', { name: /Start Recording/ })
    ).toBeNull();
    expect(
      screen.getByText(/old meeting recorder is retired/i).textContent
    ).toMatch(/\bMeet\b/);
  });
  it('never opens the microphone, even for an active legacy session', async () => {
    show(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByText(/old meeting recorder is retired/i)).toBeTruthy();
  });
});
