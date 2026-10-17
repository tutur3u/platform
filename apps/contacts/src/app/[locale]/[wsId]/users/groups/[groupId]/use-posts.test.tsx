// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { toast } from '@tuturuuu/ui/sonner';
import { type ReactNode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostDialog, useUpsertPostMutation } from './use-posts';

vi.mock(
  '@tuturuuu/internal-api/posts',
  () => import('../../../../../../../../../packages/internal-api/src/posts')
);
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { retry: false },
          queries: { retry: false },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const initial = {
  id: 'post-1',
  title: 'Original',
  content: '<p>Saved HTML</p>',
  notes: 'Original notes',
};
function useEditor(wsId = 'workspace-1') {
  return {
    ...usePostDialog(wsId, 'group-1'),
    mutation: useUpsertPostMutation('group-1', wsId),
  };
}
describe('class-post dialog with source transport', () => {
  let stored: Record<string, unknown>;
  let writes: Record<string, unknown>[];
  beforeEach(() => {
    stored = { ...initial };
    writes = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        writes.push(body);
        Object.assign(stored, body);
        return Response.json({ message: 'success' });
      })
    );
  });
  it('preserves newer notes after list refresh while a stale dialog edits its title', async () => {
    const { result, rerender } = renderHook(() => useEditor(), {
      wrapper: Wrapper,
    });
    act(() => result.current.openDialog(initial));
    stored.notes = 'Newer notes';
    rerender();
    act(() => result.current.updateField('title', 'Changed'));
    await act(async () => {
      await result.current.mutation.mutateAsync(result.current.post!);
    });
    expect(writes).toEqual([{ title: 'Changed' }]);
    expect(stored.notes).toBe('Newer notes');
    expect(stored.content).toBe(initial.content);
  });
  it.each(['', null])('sends an intentional notes clear %s', async (notes) => {
    const { result } = renderHook(() => useEditor(), { wrapper: Wrapper });
    act(() => result.current.openDialog(initial));
    act(() => result.current.updateField('notes', notes));
    await act(async () => {
      await result.current.mutation.mutateAsync(result.current.post!);
    });
    expect(writes).toEqual([{ notes }]);
    expect(stored.notes).toBe(notes);
  });
  it('keeps failed drafts for retry', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ message: 'rejected' }, { status: 500 })
    );
    const { result } = renderHook(() => useEditor(), { wrapper: Wrapper });
    act(() => result.current.openDialog(initial));
    act(() => result.current.updateField('notes', 'Retry'));
    await act(async () => {
      await expect(
        result.current.mutation.mutateAsync(result.current.post!)
      ).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledWith('ws-user-groups.post_save_failed');
    expect(result.current.post?.notes).toBe('Retry');
    expect(result.current.isOpen).toBe(true);
  });
  it.each(['edit', 'scope', 'revert'])(
    'does not close a newer %s after acknowledgment',
    async (change) => {
      const { result, rerender } = renderHook(({ wsId }) => useEditor(wsId), {
        wrapper: Wrapper,
        initialProps: { wsId: 'workspace-1' },
      });
      act(() => result.current.openDialog(initial));
      act(() => result.current.updateField('title', 'Submitted'));
      const submitted = result.current.post!;
      let finish!: () => void;
      vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        writes.push(body);
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        Object.assign(stored, body);
        return Response.json({ message: 'success' });
      });
      let saving!: ReturnType<typeof result.current.mutation.mutateAsync>;
      act(() => {
        saving = result.current.mutation.mutateAsync(submitted);
      });
      await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
      if (change === 'scope') {
        rerender({ wsId: 'workspace-2' });
        act(() => result.current.openDialog({ ...initial, id: 'post-2' }));
      } else
        act(() =>
          result.current.updateField(
            change === 'revert' ? 'title' : 'notes',
            change === 'revert' ? 'Original' : 'New edit'
          )
        );
      await act(async () => {
        finish();
        const saved = await saving;
        result.current.closeDialog(saved);
      });
      expect(result.current.isOpen).toBe(true);
      expect(result.current.post?.id).toBe(
        change === 'scope' ? 'post-2' : 'post-1'
      );
      if (change === 'edit')
        expect(result.current.post?.notes).toBe('New edit');
      if (change !== 'scope') {
        await act(async () => {
          await result.current.mutation.mutateAsync(result.current.post!);
        });
        expect(writes[1]).toEqual(
          change === 'revert' ? { title: 'Original' } : { notes: 'New edit' }
        );
      }
    }
  );
  it('retains the full create contract', async () => {
    const { result } = renderHook(() => useEditor(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutation.mutateAsync({
        title: 'New',
        content: 'Body',
        notes: '',
      });
    });
    expect(writes).toEqual([{ title: 'New', content: 'Body', notes: '' }]);
  });
});
