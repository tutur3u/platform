// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostDialog } from './post-dialog';
import { usePostDialog, useUpsertPostMutation } from './use-posts';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
afterEach(() => vi.unstubAllGlobals());

function Editor() {
  const editor = usePostDialog('workspace-1', 'group-1');
  const mutation = useUpsertPostMutation('group-1', 'workspace-1');
  return (
    <>
      <button type="button" onClick={() => editor.openDialog()}>
        Open create
      </button>
      <PostDialog
        isOpen={editor.isOpen}
        post={editor.post}
        isSubmitting={mutation.isPending}
        onClose={() => editor.closeDialog()}
        onFieldChange={editor.updateField}
        onSubmit={() => {
          if (editor.post)
            mutation.mutate(editor.post, { onSuccess: editor.closeDialog });
        }}
      />
    </>
  );
}

const emptyPost = { content: '', notes: '', title: '' };

describe('PostDialog', () => {
  it.each([undefined, 'post-1'])(
    'locks only create fields while saving %s',
    (id) => {
      render(
        <PostDialog
          isOpen
          isSubmitting
          onClose={vi.fn()}
          onFieldChange={vi.fn()}
          onSubmit={vi.fn()}
          post={{ ...emptyPost, id }}
        />
      );
      const title = screen.getByLabelText('post-email-data-table.post_title');
      if (id) expect(title).toBeEnabled();
      else expect(title).toBeDisabled();
    }
  );
  it('shows and enforces the same field limits as the post API', () => {
    const onSubmit = vi.fn();

    render(
      <PostDialog
        isOpen
        isSubmitting={false}
        onClose={vi.fn()}
        onFieldChange={vi.fn()}
        onSubmit={onSubmit}
        post={emptyPost}
      />
    );

    expect(
      screen.getByLabelText('post-email-data-table.post_title')
    ).toHaveAttribute('maxlength', String(MAX_NAME_LENGTH));
    expect(
      screen.getByLabelText('post-email-data-table.post_content')
    ).toHaveAttribute('maxlength', String(MAX_LONG_TEXT_LENGTH));

    const notesTab = screen.getByRole('tab', {
      name: 'reports-hub.post_dialog_notes',
    });
    fireEvent.mouseDown(notesTab);
    fireEvent.click(notesTab);
    expect(
      screen.getByLabelText('post-email-data-table.notes')
    ).toHaveAttribute('maxlength', String(MAX_MEDIUM_TEXT_LENGTH));

    fireEvent.click(screen.getByRole('button', { name: 'common.create' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('blocks saving an existing post until oversized content is shortened', () => {
    const onSubmit = vi.fn();

    render(
      <PostDialog
        isOpen
        isSubmitting={false}
        onClose={vi.fn()}
        onFieldChange={vi.fn()}
        onSubmit={onSubmit}
        post={{ ...emptyPost, content: 'x'.repeat(MAX_LONG_TEXT_LENGTH + 1) }}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'ws-user-groups.shorten_field'
    );
    const saveButton = screen.getByRole('button', { name: 'common.create' });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('sends one full create request while pending despite repeated clicks, then closes', async () => {
    let finish!: () => void;
    const transport = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return Response.json({ message: 'success' });
    });
    vi.stubGlobal('fetch', transport);
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <Editor />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open create' }));
    fireEvent.change(
      screen.getByLabelText('post-email-data-table.post_title'),
      { target: { value: 'Synthetic class' } }
    );
    fireEvent.change(
      screen.getByLabelText('post-email-data-table.post_content'),
      { target: { value: 'Synthetic lesson' } }
    );
    const notesTab = screen.getByRole('tab', {
      name: 'reports-hub.post_dialog_notes',
    });
    fireEvent.mouseDown(notesTab);
    fireEvent.click(notesTab);
    fireEvent.change(screen.getByLabelText('post-email-data-table.notes'), {
      target: { value: 'Ghi chú\n日本語' },
    });
    const create = screen.getByRole('button', { name: 'common.create' });
    fireEvent.click(create);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(create).toBeDisabled();
    fireEvent.click(create);
    fireEvent.doubleClick(create);
    expect(transport).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/workspaces/workspace-1/user-groups/group-1/posts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: 'Synthetic class',
          content: 'Synthetic lesson',
          notes: 'Ghi chú\n日本語',
        }),
      })
    );
    await act(async () => {
      finish();
    });
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(transport).toHaveBeenCalledOnce();
    client.clear();
  });
  it.each([null, '', 'Ghi chú\n日本語', 'x'.repeat(MAX_MEDIUM_TEXT_LENGTH)])(
    'renders saved note values without modifying them: %#',
    (notes) => {
      const onFieldChange = vi.fn();
      render(
        <PostDialog
          isOpen
          post={{ ...emptyPost, id: 'post-1', notes }}
          isSubmitting={false}
          onClose={vi.fn()}
          onFieldChange={onFieldChange}
          onSubmit={vi.fn()}
        />
      );
      const tab = screen.getByRole('tab', {
        name: 'reports-hub.post_dialog_notes',
      });
      fireEvent.mouseDown(tab);
      fireEvent.click(tab);
      expect(screen.getByLabelText('post-email-data-table.notes')).toHaveValue(
        notes ?? ''
      );
      expect(onFieldChange).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'common.save' })).toBeEnabled();
    }
  );
  it('blocks oversized notes and permits the corrected value', () => {
    const props = {
      isOpen: true,
      isSubmitting: false,
      onClose: vi.fn(),
      onFieldChange: vi.fn(),
      onSubmit: vi.fn(),
    };
    const { rerender } = render(
      <PostDialog
        {...props}
        post={{
          ...emptyPost,
          id: 'post-1',
          notes: 'x'.repeat(MAX_MEDIUM_TEXT_LENGTH + 1),
        }}
      />
    );
    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
    rerender(
      <PostDialog
        {...props}
        post={{ ...emptyPost, id: 'post-1', notes: 'Corrected' }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    expect(props.onSubmit).toHaveBeenCalledOnce();
  });
});
