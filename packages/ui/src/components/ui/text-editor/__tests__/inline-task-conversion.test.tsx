import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEditorExtensions } from '../extensions';
import { FixedToolbar } from '../tool-bar';

function createEditorStub(): TiptapEditor {
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
  } as unknown as TiptapEditor;
}

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  vi.restoreAllMocks();
});

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

  it('keeps every control in a scrollbar-free horizontal lane without shrinking', () => {
    const { container } = render(
      <FixedToolbar
        editor={createEditorStub()}
        leadingContent={<button type="button">99% left</button>}
      />
    );
    const toolbar = container.firstElementChild;
    const capacityButton = screen.getByRole('button', { name: '99% left' });
    const boldButton = screen.getByRole('button', { name: 'Bold' });
    const copyButton = screen.getByRole('button', { name: 'Copy content' });

    expect(toolbar).toHaveClass(
      '@container',
      'flex-nowrap',
      'max-w-full',
      'overflow-x-auto',
      'overflow-y-hidden',
      'overscroll-x-contain',
      'scrollbar-hide'
    );
    expect(toolbar).not.toHaveClass('flex-wrap');
    expect(copyButton.closest('.ml-auto')).toBeNull();
    expect(capacityButton.compareDocumentPosition(boldButton)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(copyButton).toHaveClass('h-8', 'w-8', 'shrink-0', 'rounded-md');
    expect(boldButton).toHaveClass('h-8', 'w-8', 'shrink-0', 'rounded-md');
  });

  it('copies the full document in either Markdown or plain-text form', async () => {
    const editor = new Editor({
      extensions: getEditorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Plan' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Ship it',
                        marks: [{ type: 'bold' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    editors.push(editor);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<FixedToolbar editor={editor} />);

    fireEvent.pointerDown(
      await screen.findByRole('button', { name: 'Copy content' })
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Copy as Markdown/ })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('menuitem', { name: /Copy as Markdown/ })
      ).not.toBeInTheDocument()
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith('# Plan\n\n- **Ship it**')
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Copy content' }));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Copy as plain text/ })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('menuitem', { name: /Copy as plain text/ })
      ).not.toBeInTheDocument()
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith('Plan\n\n• Ship it')
    );
  });
});
