// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  join: vi.fn(),
  editor: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/meet-call', () => ({
  listMeetWhiteboards: api.list,
  updateMeetWhiteboards: api.update,
  joinMeetWhiteboard: api.join,
}));
vi.mock('@tuturuuu/whiteboard/react', () => ({
  WhiteboardEditor: (props: Record<string, unknown>) => {
    api.editor(props);
    return <div data-testid="editor" />;
  },
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));

const { BoardPanel } = await import('./board-panel');
const boardId = '33333333-4444-4555-8666-777777777777';

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <BoardPanel meetingId="m" accountId="a" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('BoardPanel', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.update.mockResolvedValue({ boardId: 'created-elsewhere' });
  });
  afterEach(cleanup);

  it('tells a participant when nothing is shared', async () => {
    api.list.mockResolvedValue({ canManage: false, links: [], available: [] });
    mount();
    expect(
      await screen.findByText('No whiteboard has been shared in this meeting yet.')
    ).toBeTruthy();
    expect(screen.queryByLabelText('New whiteboard name')).toBeNull();
  });

  it('lets a manager create a board and shows link settings', async () => {
    api.list.mockResolvedValue({
      canManage: true,
      links: [{ boardId, title: 'Plan', role: 'edit', guestAccess: 'view' }],
      available: [{ id: 'x', title: 'Spare' }],
    });
    mount();
    await screen.findByText('Plan');
    fireEvent.change(screen.getByLabelText('New whiteboard name'), {
      target: { value: 'Retro' },
    });
    fireEvent.click(screen.getByText('Create and link'));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('m', {
        action: 'create',
        title: 'Retro',
        guestAccess: 'view',
      })
    );
    fireEvent.click(screen.getByLabelText('Remove from this meeting'));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('m', { action: 'unlink', boardId })
    );
  });

  it('opens a board as read-only for a view role and goes back', async () => {
    api.list.mockResolvedValue({
      canManage: false,
      links: [{ boardId, title: 'Plan', role: 'view' }],
      available: [],
    });
    api.join.mockResolvedValue({
      endpoint: 'wss://rt.example.invalid/whiteboard',
      token: 't',
      role: 'view',
      refreshSeconds: 60,
      board: { id: boardId, title: 'Plan' },
      user: { id: 'u', displayName: 'U' },
    });
    mount();
    fireEvent.click(await screen.findByText('Open'));
    await screen.findByTestId('editor');
    const props = api.editor.mock.calls.at(-1)![0] as Record<string, any>;
    expect(props.readOnly).toBe(true);
    expect(props.theme).toBe('dark');
    expect(props.collaboration.user).toEqual({ id: 'u', displayName: 'U' });
    expect(screen.getByText('View only')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('All boards'));
    expect(await screen.findByText('Open')).toBeTruthy();
  });

  it('explains a refused board instead of opening it', async () => {
    api.list.mockResolvedValue({
      canManage: false,
      links: [{ boardId, title: 'Plan', role: 'view' }],
      available: [],
    });
    api.join.mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }));
    mount();
    fireEvent.click(await screen.findByText('Open'));
    expect(
      await screen.findByText('This whiteboard is no longer available in this meeting.')
    ).toBeTruthy();
  });
});
