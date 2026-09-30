import type { UseMutationResult } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AddCategoryDialog, AddIndicatorDialog } from './indicator-dialogs';
import { IndicatorToolbar } from './indicator-toolbar';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

function renderCreation(kind: 'indicator' | 'category', pending = false) {
  const mutateAsync = vi.fn().mockResolvedValue({});
  const onOpenChange = vi.fn();
  const mutation = {
    mutateAsync,
    isPending: pending,
  } as unknown as UseMutationResult<unknown, Error, never>;
  if (kind === 'indicator') {
    render(
      <AddIndicatorDialog
        open
        onOpenChange={onOpenChange}
        createMutation={
          mutation as ComponentProps<
            typeof AddIndicatorDialog
          >['createMutation']
        }
        metricCategories={Array.from({ length: 30 }, (_, i) => ({
          id: `category-${i}`,
          name: `Category ${i}`,
          description: '',
        }))}
        isAnyMutationPending={pending}
      />
    );
  } else {
    render(
      <AddCategoryDialog
        open
        onOpenChange={onOpenChange}
        createMutation={
          mutation as ComponentProps<typeof AddCategoryDialog>['createMutation']
        }
        isAnyMutationPending={pending}
      />
    );
  }
  return {
    mutateAsync,
    onOpenChange,
    name: screen.getByLabelText(
      kind === 'indicator' ? 'indicator_name' : 'metric_category_name'
    ),
    submit: screen.getByRole('button', {
      name: pending
        ? 'adding'
        : kind === 'indicator'
          ? 'add_indicator'
          : 'add_metric_category',
    }),
    error:
      kind === 'indicator'
        ? 'failed_to_create_indicator'
        : 'failed_to_create_category',
  };
}

describe.each(['indicator', 'category'] as const)(
  '%s creation dialog',
  (kind) => {
    it('explains the required name and prevents blank submissions', () => {
      const { name, submit, mutateAsync } = renderCreation(kind);
      expect(name).toBeRequired();
      expect(name).toHaveAccessibleDescription('name_required');
      expect(submit).toBeDisabled();
      fireEvent.change(name, { target: { value: '   ' } });
      fireEvent.click(submit);
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('retains the draft and shows failures inside the dialog, then permits retry', async () => {
      const { name, submit, mutateAsync, onOpenChange, error } =
        renderCreation(kind);
      mutateAsync.mockRejectedValueOnce(new Error('synthetic server failure'));
      fireEvent.change(name, { target: { value: ' Quiz 1 ' } });
      fireEvent.click(submit);
      expect(await screen.findByRole('alert')).toHaveTextContent(error);
      expect(name).toHaveValue(' Quiz 1 ');
      expect(onOpenChange).not.toHaveBeenCalled();
      fireEvent.click(submit);
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(mutateAsync).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: 'Quiz 1' })
      );
      expect(name).toHaveValue('');
    });

    it('guards repeated taps while the server request is unresolved', async () => {
      const { name, submit, mutateAsync, onOpenChange } = renderCreation(kind);
      let resolve!: () => void;
      mutateAsync.mockReturnValue(
        new Promise<void>((done) => {
          resolve = done;
        })
      );
      fireEvent.change(name, { target: { value: 'Quiz 1' } });
      act(() => {
        fireEvent.click(submit);
        fireEvent.click(submit);
      });
      expect(mutateAsync).toHaveBeenCalledOnce();
      expect(submit).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'common.cancel' })
      ).toBeDisabled();
      await act(async () => resolve());
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('blocks creation during other pending mutations', () => {
      const { name, submit, mutateAsync } = renderCreation(kind, true);
      fireEvent.change(name, { target: { value: 'Quiz 1' } });
      fireEvent.click(submit);
      expect(submit).toBeDisabled();
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('bounds the dialog and gives the form a shrinking scroll region', () => {
      const { submit, name } = renderCreation(kind);
      expect(screen.getByRole('dialog')).toHaveClass(
        'flex',
        'max-h-[calc(100dvh-2rem)]',
        'overflow-hidden'
      );
      expect(name.closest('.overflow-y-auto')).toHaveClass('min-h-0', 'flex-1');
      expect(submit.closest('[data-slot="dialog-footer"]')).toHaveClass(
        'shrink-0'
      );
    });
  }
);

it('hides creation actions for members without create permission', () => {
  render(
    <IndicatorToolbar
      canCreate={false}
      onAddCategoryClick={vi.fn()}
      onAddIndicatorClick={vi.fn()}
    />
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('offers creation to authorized members and admins through the same permission', () => {
  render(
    <IndicatorToolbar
      canCreate
      onAddCategoryClick={vi.fn()}
      onAddIndicatorClick={vi.fn()}
    />
  );
  expect(screen.getByRole('button', { name: 'add_indicator' })).toBeEnabled();
});
