// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MeetMailShare } from './meet-mail-share';
const api = vi.hoisted(() => ({ people: vi.fn() }));
vi.mock('@tuturuuu/internal-api/people', () => ({
  searchWorkspacePeople: api.people,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
const actorId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  api.people.mockResolvedValue({
    data: [
      {
        kind: 'member',
        id: 'one',
        displayName: 'Allowed',
        email: 'guest@example.invalid',
      },
      { kind: 'member', id: 'hidden', displayName: 'Hidden', email: null },
    ],
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('selects permitted emails in the real dialog and opens a known join link in a fixed Mail fragment', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <MeetMailShare
        open
        onOpenChange={() => {}}
        meetingId="5e5217de-9bb3-4e20-8d99-526ad3e7e34f"
        title="Meeting <b>plain</b>"
        workspaceId={workspaceId}
        actorId={actorId}
      />
    </QueryClientProvider>
  );
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'add' }));
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'guest' },
  });
  const allowed = await screen.findByRole('option', { name: /Allowed/ });
  expect(screen.queryByText('Hidden')).toBeNull();
  fireEvent.click(allowed);
  fireEvent.click(screen.getByRole('button', { name: 'open' }));
  expect(open).toHaveBeenCalledOnce();
  const url = new URL(String(open.mock.calls[0]?.[0]));
  expect(url.origin).toBe('https://mail.tuturuuu.com');
  expect(url.search).toBe('');
  const payload = JSON.parse(
    decodeURIComponent(url.hash.slice('#meet-mail='.length))
  );
  expect(payload.to).toEqual(['guest@example.invalid']);
  expect(payload.body).toContain(
    'https://meet.tuturuuu.com/r/bs91fqmvp-d7213csa9-nd7sz39w'
  );
  expect(payload.actorId).toBe(actorId);
  expect(payload.workspaceId).toBe(workspaceId);
  expect(payload).not.toHaveProperty('html');
  open.mockRestore();
});
