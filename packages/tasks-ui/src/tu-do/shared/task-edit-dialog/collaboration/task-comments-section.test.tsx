/**
 * @vitest-environment jsdom
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { TaskCommentsSection } from './task-comments-section';
import { echoTranslator, renderWithQuery } from './test-utils';
import type { TaskComment } from './types';

vi.mock('next-intl', () => ({
  useTranslations: () => echoTranslator,
  useLocale: () => 'en',
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('./api');

const nativeComment: TaskComment = {
  id: 'c1',
  task_id: 't1',
  author: { id: 'u1', display_name: 'Ada Lovelace', avatar_url: null },
  external_author: null,
  external_url: null,
  body: 'Ship it **today**',
  created_at: '2026-11-20T10:00:00.000Z',
  edited_at: '2026-11-21T10:00:00.000Z',
};

const externalComment: TaskComment = {
  id: 'c2',
  task_id: 't1',
  author: null,
  external_author: 'octocat',
  external_url: 'https://github.com/o/r/issues/1#issuecomment-9',
  body: 'Imported note',
  created_at: '2026-01-02T10:00:00.000Z',
  edited_at: null,
};

function renderSection(
  props: Partial<Parameters<typeof TaskCommentsSection>[0]> = {}
) {
  return renderWithQuery(
    <TaskCommentsSection currentUserId="u1" taskId="t1" wsId="ws" {...props} />
  );
}

describe('TaskCommentsSection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.listTaskComments).mockResolvedValue({
      comments: [nativeComment, externalComment],
      nextCursor: null,
    });
  });

  it('renders native comments with author, markdown and the edited marker', async () => {
    renderSection();

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('today').tagName).toBe('STRONG');
    expect(screen.getByText('edited')).toBeInTheDocument();
    expect(screen.getAllByRole('time')).toHaveLength(2);
  });

  it('renders imported comments with the GitHub login, marker and link', async () => {
    renderSection();

    const login = await screen.findByRole('link', { name: 'octocat' });
    expect(login).toHaveAttribute(
      'href',
      'https://github.com/o/r/issues/1#issuecomment-9'
    );
    expect(screen.getByText('github')).toBeInTheDocument();
    expect(screen.getByText('Imported note')).toBeInTheDocument();
  });

  it('offers edit and delete on the caller own comments only', async () => {
    renderSection();
    await screen.findByText('Ada Lovelace');

    expect(screen.getAllByRole('button', { name: 'edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'delete' })).toHaveLength(1);
  });

  it('lets a moderator delete any comment but edit none of them', async () => {
    renderSection({ canModerate: true, currentUserId: 'someone-else' });
    await screen.findByText('Ada Lovelace');

    expect(screen.queryByRole('button', { name: 'edit' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'delete' })).toHaveLength(2);
  });

  it('hides the composer and actions when read-only', async () => {
    renderSection({ disabled: true });
    await screen.findByText('Ada Lovelace');

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'delete' })).toBeNull();
  });

  it('confirms deletion in an alert dialog before deleting', async () => {
    vi.mocked(api.deleteTaskComment).mockResolvedValue({});
    renderSection();
    await screen.findByText('Ada Lovelace');

    fireEvent.click(screen.getByRole('button', { name: 'delete' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'delete_comment_title'
    );
    expect(api.deleteTaskComment).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getAllByRole('button', { name: 'delete' }).at(-1) as HTMLElement
    );
    await waitFor(() =>
      expect(api.deleteTaskComment).toHaveBeenCalledWith('ws', 't1', 'c1')
    );
  });

  it('posts a trimmed new comment and clears the composer', async () => {
    vi.mocked(api.createTaskComment).mockResolvedValue({
      comment: nativeComment,
    });
    renderSection();
    await screen.findByText('Ada Lovelace');

    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: '  hello  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'comment' }));

    await waitFor(() =>
      expect(api.createTaskComment).toHaveBeenCalledWith('ws', 't1', 'hello')
    );
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('edits a comment in place', async () => {
    vi.mocked(api.updateTaskComment).mockResolvedValue({
      comment: nativeComment,
    });
    renderSection();
    await screen.findByText('Ada Lovelace');

    fireEvent.click(screen.getByRole('button', { name: 'edit' }));
    const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement;
    expect(editor).toHaveValue('Ship it **today**');
    fireEvent.change(editor, { target: { value: 'Ship it tomorrow' } });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    await waitFor(() =>
      expect(api.updateTaskComment).toHaveBeenCalledWith(
        'ws',
        't1',
        'c1',
        'Ship it tomorrow'
      )
    );
  });

  it('shows the empty and error states', async () => {
    vi.mocked(api.listTaskComments).mockResolvedValue({
      comments: [],
      nextCursor: null,
    });
    const { unmount } = renderSection();
    expect(await screen.findByText('no_comments')).toBeInTheDocument();
    unmount();

    vi.mocked(api.listTaskComments).mockRejectedValue(new Error('boom'));
    renderSection();
    expect(await screen.findByText('comments_load_failed')).toBeInTheDocument();
  });
});
