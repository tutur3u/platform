import { fireEvent, render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';
import { FixedToolbar } from '../tool-bar';

function createEditorStub(): Editor {
  const chain = {
    focus: vi.fn(() => chain),
    insertTable: vi.fn(() => chain),
    setTextAlign: vi.fn(() => chain),
    toggleBold: vi.fn(() => chain),
    toggleBulletListSmart: vi.fn(() => chain),
    toggleHeading: vi.fn(() => chain),
    toggleHighlight: vi.fn(() => chain),
    toggleItalic: vi.fn(() => chain),
    toggleLink: vi.fn(() => chain),
    toggleOrderedListSmart: vi.fn(() => chain),
    toggleStrike: vi.fn(() => chain),
    toggleSubscript: vi.fn(() => chain),
    toggleSuperscript: vi.fn(() => chain),
    toggleTaskListSmart: vi.fn(() => chain),
    run: vi.fn(() => true),
  };

  return {
    chain: vi.fn(() => chain),
    isActive: vi.fn(() => false),
  } as unknown as Editor;
}

describe('inline task conversion toolbar', () => {
  it('delegates conversion to the provided callback', async () => {
    const onConvertToTask = vi.fn();

    render(
      <FixedToolbar
        editor={createEditorStub()}
        onConvertToTask={onConvertToTask}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Convert to Task' }));

    expect(onConvertToTask).toHaveBeenCalledTimes(1);
  });
});
