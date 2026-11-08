import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvatarEditor, type AvatarEditorCropRequest } from '../avatar-editor';

const labels = {
  edit: 'Edit avatar',
  fileTooLarge: 'File is too large',
  invalidImage: 'Use an image',
  processFailed: 'Could not process the image',
  remove: 'Remove avatar',
  replace: 'New avatar',
  save: 'Save avatar',
  upload: 'Upload avatar',
};

function renderEditor({
  allowEdit = true,
  onRemove = vi.fn().mockResolvedValue(undefined),
  onSave = vi.fn().mockResolvedValue('https://cdn.example/next.jpg'),
  prepareFile = async (blob: Blob) =>
    new File([blob], 'avatar.jpg', { type: 'image/jpeg' }),
  src = 'https://cdn.example/current.jpg',
}: {
  allowEdit?: boolean;
  onRemove?: () => Promise<void>;
  onSave?: (file: File) => Promise<string | null>;
  prepareFile?: (blob: Blob) => Promise<File>;
  src?: string | null;
} = {}) {
  render(
    <AvatarEditor
      allowEdit={allowEdit}
      alt="Avatar"
      description="Choose a picture"
      fallback="AB"
      labels={labels}
      onRemove={onRemove}
      onSave={onSave}
      prepareFile={prepareFile}
      renderCropper={(crop: AvatarEditorCropRequest) =>
        crop.open ? (
          <button
            type="button"
            onClick={() => crop.onCropComplete(new Blob(['crop']))}
          >
            Apply crop
          </button>
        ) : null
      }
      src={src}
      title="Avatar"
    />
  );

  return { onRemove, onSave };
}

describe('AvatarEditor', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });

  it('hides the editor when edits are not allowed', () => {
    renderEditor({ allowEdit: false });

    expect(
      screen.queryByRole('button', { name: 'Edit avatar' })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Upload avatar')).not.toBeInTheDocument();
    expect(screen.getByText('AB')).toBeVisible();
  });

  it('discards a pending picture without removing the saved avatar', async () => {
    const { onRemove } = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Edit avatar' }));
    const input = screen.getByLabelText('New avatar');
    fireEvent.change(input, {
      target: {
        files: [new File(['image'], 'photo.png', { type: 'image/png' })],
      },
    });
    fireEvent.click(
      screen.getByRole('button', { hidden: true, name: 'Apply crop' })
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save avatar' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove avatar' }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove avatar' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save avatar' })).toBeDisabled();
  });

  it('saves the cropped file and rolls back when removal fails', async () => {
    const onSave = vi.fn().mockResolvedValue('https://cdn.example/next.jpg');
    const onRemove = vi.fn().mockRejectedValue(new Error('remove failed'));
    renderEditor({ onRemove, onSave });

    fireEvent.click(screen.getByRole('button', { name: 'Edit avatar' }));
    fireEvent.change(screen.getByLabelText('New avatar'), {
      target: {
        files: [new File(['image'], 'photo.png', { type: 'image/png' })],
      },
    });
    fireEvent.click(
      screen.getByRole('button', { hidden: true, name: 'Apply crop' })
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save avatar' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save avatar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved).toBeInstanceOf(File);
    expect(saved?.type).toBe('image/jpeg');
    expect(saved?.size).toBeLessThan(2 * 1024 * 1024);
    expect(
      screen.queryByRole('button', { name: 'Save avatar' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit avatar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove avatar' }));

    expect(onRemove).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole('button', { name: 'Remove avatar' })
    ).toBeVisible();
  });

  it('refuses a cropped file over the size limit', async () => {
    const { onSave } = renderEditor({
      prepareFile: async () =>
        new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'avatar.jpg', {
          type: 'image/jpeg',
        }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit avatar' }));
    fireEvent.change(screen.getByLabelText('New avatar'), {
      target: {
        files: [new File(['image'], 'photo.png', { type: 'image/png' })],
      },
    });
    fireEvent.click(
      screen.getByRole('button', { hidden: true, name: 'Apply crop' })
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save avatar' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save avatar' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: 'Save avatar' })
    ).toBeEnabled();
  });
});
