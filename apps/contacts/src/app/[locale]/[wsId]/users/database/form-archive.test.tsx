import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UserForm from './form';

const { updateUser } = vi.hoisted(() => ({ updateUser: vi.fn() }));
vi.mock('@tuturuuu/internal-api/users', () => ({
  updateWorkspaceUser: (...args: unknown[]) => updateUser(...args),
  createWorkspaceUser: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/profile-media', () => ({
  uploadWorkspaceUserAvatar: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));
vi.mock('@tuturuuu/users-ui/hooks/use-user-status-labels', () => ({
  useUserStatusLabels: () => ({
    permanently_archived: 'Archived',
    archived_until: 'Archive until',
  }),
}));
vi.mock('@tuturuuu/users-ui/components/image-cropper', () => ({
  ImageCropper: () => null,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
function mount(archivedUntil: string | null, archived = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <UserForm
          wsId="synthetic-workspace"
          data={
            {
              id: 'synthetic-student',
              full_name: 'Synthetic Student',
              archived,
              archived_until: archivedUntil,
            } as WorkspaceUser
          }
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
async function saveUnrelatedNote(expectedCalls = 1) {
  fireEvent.change(screen.getByLabelText('ws-users.note'), {
    target: { value: 'Synthetic unrelated note' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
  await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(expectedCalls));
  return updateUser.mock.calls[expectedCalls - 1]?.[2];
}
describe('actual student form archive intent', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    updateUser.mockReset().mockResolvedValue({});
  });
  it.each(['2000-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z'])(
    'preserves explicit active status on unrelated save with stored date %s',
    async (date) => {
      mount(date);
      expect((await saveUnrelatedNote()).archived).toBe(false);
    }
  );
  it('preserves active status while editing a different field with a stored date', async () => {
    mount('2099-01-01T00:00:00.000Z');
    fireEvent.change(screen.getByLabelText('ws-users.full_name'), {
      target: { value: 'Synthetic Changed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
    expect(updateUser.mock.calls[0]?.[2]).toMatchObject({
      archived: false,
      full_name: 'Synthetic Changed',
    });
  });
  it('reopening and repeatedly saving an active student does not archive them', async () => {
    const first = mount('2000-01-01T00:00:00.000Z');
    expect((await saveUnrelatedNote()).archived).toBe(false);
    first.unmount();
    mount('2000-01-01T00:00:00.000Z');
    expect((await saveUnrelatedNote(2)).archived).toBe(false);
    expect((await saveUnrelatedNote(3)).archived).toBe(false);
  });
  it('explicitly selecting a temporary archive date archives the student', async () => {
    mount(null);
    const picker = screen
      .getByText('Archive until')
      .closest('[data-slot="form-item"]') as HTMLElement;
    fireEvent.click(
      within(picker).getByRole('button', { name: 'Pick a date' })
    );
    fireEvent.click(
      within(screen.getByRole('grid')).getByRole('button', { name: /15/ })
    );
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
    expect(updateUser.mock.calls[0]?.[2]).toMatchObject({ archived: true });
    expect(updateUser.mock.calls[0]?.[2].archived_until).toBeTruthy();
  });
  it('retains explicitly archived status with an existing date', async () => {
    mount('2099-01-01T00:00:00.000Z', true);
    expect((await saveUnrelatedNote()).archived).toBe(true);
  });
  it('allows clearing a temporary date and explicitly returning to active', async () => {
    mount('2099-01-01T00:00:00.000Z', true);
    const dateButton = screen.getByRole('button', {
      name: 'January 1st, 2099',
    });
    const clear = within(dateButton.parentElement!)
      .getAllByRole('button')
      .find((b) => b !== dateButton)!;
    fireEvent.click(clear);
    fireEvent.click(
      within(
        screen
          .getByText('Archived')
          .closest('[data-slot="form-item"]') as HTMLElement
      ).getByRole('switch')
    );
    expect((await saveUnrelatedNote()).archived).toBe(false);
  });
});
