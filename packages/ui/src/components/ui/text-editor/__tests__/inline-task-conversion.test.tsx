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
    toggleDetailsBlock: vi.fn(() => chain),
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

  it('exposes toggle blocks and delegates the command through the editor chain', () => {
    const editor = createEditorStub();
    render(<FixedToolbar editor={editor} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Toggle List or Heading' })
    );

    const chain = vi.mocked(editor.chain).mock.results[0]?.value as {
      toggleDetailsBlock: ReturnType<typeof vi.fn>;
      run: ReturnType<typeof vi.fn>;
    };
    expect(chain.toggleDetailsBlock).toHaveBeenCalledTimes(1);
    expect(chain.run).toHaveBeenCalled();
  });

  it('uses the localized toggle block label when provided', () => {
    render(
      <FixedToolbar
        editor={createEditorStub()}
        toggleBlockLabel="Liste ou titre repliable"
      />
    );

    expect(
      screen.getByRole('button', { name: 'Liste ou titre repliable' })
    ).toBeInTheDocument();
  });
});
