import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { toast } from '@tuturuuu/ui/sonner';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  getDraftStorageKey,
  saveDraft,
} from '../shared/task-edit-dialog/utils';
import type { TaskDraft } from './draft-card';
import { DraftsPage } from './drafts-page';

const { listDrafts, deleteDraft } = vi.hoisted(() => ({
  listDrafts: vi.fn(),
  deleteDraft: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTaskDrafts: listDrafts,
  deleteWorkspaceTaskDraft: deleteDraft,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../providers/task-dialog-provider', () => ({
  useTaskDialogContext: () => ({ editDraft: vi.fn() }),
}));
vi.mock('./draft-card', () => ({
  DraftCard: ({
    draft,
    onDelete,
    onConvert,
  }: {
    draft: TaskDraft;
    onDelete: (id: string) => void;
    onConvert: (draft: TaskDraft) => void;
  }) => (
    <>
      <button type="button" onClick={() => onDelete(draft.id)}>
        Delete saved draft
      </button>
      <button type="button" onClick={() => onConvert(draft)}>
        Convert saved draft
      </button>
    </>
  ),
}));
vi.mock('./draft-convert-dialog', () => ({
  DraftConvertDialog: ({
    isOpen,
    onConverted,
  }: {
    isOpen: boolean;
    onConverted: () => void;
  }) =>
    isOpen ? (
      <button type="button" onClick={onConverted}>
        Confirm converted
      </button>
    ) : null,
}));

const draft = { id: 'saved-1', board_id: 'board-1', name: 'Saved draft' };
const savedKey = getDraftStorageKey('board-1', 'saved-1');
const ordinaryKey = getDraftStorageKey('board-1');
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  listDrafts.mockResolvedValue([draft]);
  saveDraft(savedKey, { name: 'Recover saved draft' });
  saveDraft(ordinaryKey, { name: 'Keep ordinary draft' });
});
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DraftsPage wsId="ws-1" />
    </QueryClientProvider>
  );
}

it('clears only the matching recovery copy after deletion is confirmed', async () => {
  let resolveDelete!: () => void;
  deleteDraft.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      resolveDelete = resolve;
    })
  );
  mount();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Delete saved draft' })
  );
  await waitFor(() => expect(deleteDraft).toHaveBeenCalledOnce());
  expect(localStorage.getItem(savedKey)).not.toBeNull();
  await act(async () => resolveDelete());
  await waitFor(() => expect(localStorage.getItem(savedKey)).toBeNull());
  expect(JSON.parse(localStorage.getItem(ordinaryKey)!)).toEqual({
    name: 'Keep ordinary draft',
  });
});

it('keeps recovery data when deletion fails', async () => {
  deleteDraft.mockRejectedValueOnce(new Error('Unavailable'));
  mount();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Delete saved draft' })
  );
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith('delete_failed')
  );
  expect(localStorage.getItem(savedKey)).not.toBeNull();
  expect(localStorage.getItem(ordinaryKey)).not.toBeNull();
});

it('clears the converted draft recovery without removing another board draft', async () => {
  mount();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Convert saved draft' })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirm converted' }));
  expect(localStorage.getItem(savedKey)).toBeNull();
  expect(localStorage.getItem(ordinaryKey)).not.toBeNull();
});
