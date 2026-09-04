import { fireEvent, render, screen } from '@testing-library/react';
import type { NodeViewProps } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskItemCheckboxContent } from './task-item-checkbox-view';

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: vi.fn(),
}));

vi.mock('./task-item-checkbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./task-item-checkbox')>();

  return {
    ...actual,
    useMentionedTaskStatuses: () => ({ data: [] }),
  };
});

function createNodeViewProps() {
  const setNodeMarkup = vi.fn();
  const command = vi.fn(
    (
      callback: (props: {
        tr: { setNodeMarkup: typeof setNodeMarkup };
      }) => boolean
    ) => callback({ tr: { setNodeMarkup } })
  );

  const props = {
    node: {
      attrs: { checked: false },
      descendants: vi.fn(),
    },
    getPos: () => 4,
    editor: {
      isEditable: true,
      commands: { command },
    },
  } as unknown as NodeViewProps;

  return { command, props, setNodeMarkup };
}

describe('TaskItemCheckboxContent', () => {
  it('cycles pointer interactions before the editor can replace the node view', () => {
    const { props, setNodeMarkup } = createNodeViewProps();
    render(<TaskItemCheckboxContent {...props} />);

    const checkbox = screen.getByRole('checkbox', {
      name: 'Task item status',
    });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');

    fireEvent.pointerDown(checkbox, { button: 0, isPrimary: true });

    expect(setNodeMarkup).toHaveBeenLastCalledWith(4, undefined, {
      checked: 'indeterminate',
    });
    expect(checkbox).toHaveAttribute('aria-checked', 'mixed');
  });

  it('cycles all three states from the keyboard', () => {
    const { props, setNodeMarkup } = createNodeViewProps();
    render(<TaskItemCheckboxContent {...props} />);

    const checkbox = screen.getByRole('checkbox', {
      name: 'Task item status',
    });

    fireEvent.keyDown(checkbox, { key: ' ' });
    fireEvent.keyDown(checkbox, { key: 'Enter' });
    fireEvent.keyDown(checkbox, { key: ' ' });

    expect(setNodeMarkup).toHaveBeenNthCalledWith(1, 4, undefined, {
      checked: 'indeterminate',
    });
    expect(setNodeMarkup).toHaveBeenNthCalledWith(2, 4, undefined, {
      checked: true,
    });
    expect(setNodeMarkup).toHaveBeenNthCalledWith(3, 4, undefined, {
      checked: false,
    });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
  });
});
