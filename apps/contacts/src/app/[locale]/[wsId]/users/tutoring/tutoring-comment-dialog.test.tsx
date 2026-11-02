import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TutoringCommentDialog } from './tutoring-comment-dialog';

const api = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn() }));
vi.mock('@tuturuuu/internal-api/tutoring', () => ({
  getTutoringSessionComment: api.read,
  updateTutoringSession: api.update,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { warning: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function open() {
  api.update.mockResolvedValue({});
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <TutoringCommentDialog
        wsId="ws"
        sessionId="session"
        complete
        canManage
        onClose={() => {}}
      />
    </QueryClientProvider>
  );
}
it.each(['pending', '403', 'failed'])(
  'completion works with comment read %s',
  async (mode) => {
    if (mode === 'pending') api.read.mockReturnValue(new Promise(() => {}));
    else api.read.mockRejectedValue(new Error(mode));
    open();
    if (mode !== 'pending')
      await waitFor(() => expect(api.read).toHaveBeenCalled());
    const save = screen.getByRole('button', { name: 'mark_done' });
    expect(save.hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(save);
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith('ws', 'session', {
        attendanceStatus: 'DONE',
      })
    );
  }
);
it('a read-only manager completes without overwriting the tutor comment', async () => {
  api.read.mockResolvedValue({ tutorComment: 'Tutor note', canEdit: false });
  open();
  await screen.findByDisplayValue('Tutor note');
  expect(screen.getByRole('textbox').hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'mark_done' }));
  await waitFor(() =>
    expect(api.update).toHaveBeenCalledWith('ws', 'session', {
      attendanceStatus: 'DONE',
    })
  );
});
