import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { RichTextEditor } from '../editor';

const useEditorMock = vi.hoisted(() => vi.fn((..._args: unknown[]) => null));

vi.mock('@tiptap/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tiptap/react')>()),
  EditorContent: () => null,
  useEditor: (...args: unknown[]) => useEditorMock(...args),
}));

vi.mock('../tool-bar', () => ({
  FixedToolbar: ({ className }: { className?: string }) => (
    <div className={className} data-testid="fixed-toolbar" />
  ),
  ToolBar: () => null,
}));

type UseEditorCall = [
  { extensions: Array<{ name: string }> },
  unknown[] | undefined,
];

function lastCall(): UseEditorCall {
  const calls = useEditorMock.mock.calls as unknown as UseEditorCall[];
  const call = calls.at(-1);
  if (!call) throw new Error('useEditor was never called');
  return call;
}

function extensionNames() {
  return lastCall()[0].extensions.map((extension) => extension.name);
}

describe('RichTextEditor collaboration binding', () => {
  beforeEach(() => {
    useEditorMock.mockClear();
  });

  it('omits the collaboration extension while collaboration is off', () => {
    render(
      <RichTextEditor
        allowCollaboration={false}
        content={null}
        yjsDoc={undefined}
      />
    );

    expect(extensionNames()).not.toContain('collaboration');
  });

  // Regression: `Editor.setOptions({ extensions })` does not rebuild the
  // extension manager, so the only way to attach the Collaboration extension
  // after mount is to recreate the editor. A task dialog opened from a deep link
  // mounts before the task hydrates — i.e. with collaboration off — and used to
  // stay non-collaborative forever, leaving the description permanently empty.
  it('rebuilds the editor when collaboration turns on after mount', () => {
    const doc = new Y.Doc();
    const { rerender } = render(
      <RichTextEditor allowCollaboration={false} content={null} yjsDoc={doc} />
    );

    const initialDeps = lastCall()[1];
    expect(extensionNames()).not.toContain('collaboration');

    rerender(<RichTextEditor allowCollaboration content={null} yjsDoc={doc} />);

    const collaborativeCall = lastCall();
    expect(collaborativeCall[0].extensions.map((e) => e.name)).toContain(
      'collaboration'
    );
    // A changed dependency array is what makes `useEditor` throw away the
    // non-collaborative instance and build a new one.
    expect(collaborativeCall[1]).not.toEqual(initialDeps);
    expect(collaborativeCall[1]).toContain(doc);
  });

  it('keeps a stable dependency array across unrelated re-renders', () => {
    const doc = new Y.Doc();
    const { rerender } = render(
      <RichTextEditor allowCollaboration content={null} yjsDoc={doc} />
    );

    const initialDeps = lastCall()[1];

    // `collaborationUser` is a fresh object on every render in the task dialog;
    // it must not be part of the dependency array or the editor would be
    // rebuilt (and the caret reset) on every render.
    rerender(
      <RichTextEditor
        allowCollaboration
        collaborationUser={{ color: '#fff', name: 'Ada' }}
        content={null}
        yjsDoc={doc}
      />
    );

    expect(lastCall()[1]).toEqual(initialDeps);
  });

  // The provider only drives CollaborationCaret (cosmetic remote cursors).
  // Rebuilding a live editor for it would tear down the ProseMirror view and
  // re-run the Yjs binding over the whole document mid-session — expensive and
  // user-visible on a large document, for no content benefit.
  it('does not rebuild the editor when only the provider arrives', () => {
    const doc = new Y.Doc();
    const provider = { awareness: { setLocalStateField: () => {} } };
    const { rerender } = render(
      <RichTextEditor allowCollaboration content={null} yjsDoc={doc} />
    );

    const initialDeps = lastCall()[1];

    rerender(
      <RichTextEditor
        allowCollaboration
        collaborationUser={{ color: '#fff', name: 'Ada' }}
        content={null}
        yjsDoc={doc}
        yjsProvider={provider as never}
      />
    );

    expect(lastCall()[1]).toEqual(initialDeps);
  });
});

describe('RichTextEditor toolbar reveal', () => {
  beforeEach(() => {
    useEditorMock.mockClear();
  });

  // The toolbar must reveal on focus *within* the editor wrapper, not on editor
  // focus alone: clicking a toolbar button moves focus out of the text, so a
  // stricter rule would hide the toolbar on mousedown and swallow the click.
  it('hides the toolbar until focus lands inside the editor', () => {
    const { container } = render(
      <RichTextEditor content={null} revealToolbarOnFocus />
    );

    const toolbar = container.querySelector('[data-testid="fixed-toolbar"]');
    expect(toolbar?.className).toContain('opacity-0');
    expect(toolbar?.className).toContain('group-focus-within:opacity-100');
    // Inert while hidden, so it cannot show hover states or tooltips; the
    // wrapper turns a press in that strip into editor focus instead.
    expect(toolbar?.className).toContain('pointer-events-none');
    expect(toolbar?.className).toContain(
      'group-focus-within:pointer-events-auto'
    );
    expect(container.firstElementChild?.className).toContain('group');
  });

  it('leaves the toolbar visible by default', () => {
    const { container } = render(<RichTextEditor content={null} />);

    const toolbar = container.querySelector('[data-testid="fixed-toolbar"]');
    expect(toolbar?.className ?? '').not.toContain('opacity-0');
  });
});
