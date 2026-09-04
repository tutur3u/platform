// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { describe, expect, it, vi } from 'vitest';
import { PostDialog } from './post-dialog';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const emptyPost = { content: '', notes: '', title: '' };

describe('PostDialog', () => {
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
});
