import { waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it, vi } from 'vitest';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import * as Y from 'yjs';
import {
  renderCollaborationCaret,
  renderCollaborationSelection,
  scrollToCollaborationCaret,
} from '../collaboration-carets';

describe('remote cursors and selections', () => {
  it('identifies duplicate names by account ID and safely renders untrusted names', () => {
    const root = document.createElement('div');
    const first = renderCollaborationCaret({
      id: 'first',
      name: 'Alex',
      color: '#123456',
    });
    const second = renderCollaborationCaret({
      id: 'second',
      name: 'Alex',
      color: '#654321',
    });
    const scrollFirst = vi.fn();
    const scrollSecond = vi.fn();
    first.scrollIntoView = scrollFirst;
    second.scrollIntoView = scrollSecond;
    root.append(first, second);
    expect(scrollToCollaborationCaret(root, 'second')).toBe(true);
    expect(scrollFirst).not.toHaveBeenCalled();
    expect(scrollSecond).toHaveBeenCalledOnce();
    const unsafe = renderCollaborationCaret({
      id: 'third',
      name: '<img src=x onerror=alert(1)>',
      color: 'url(evil)',
    });
    expect(unsafe.querySelector('img')).toBeNull();
    expect(unsafe.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(
      renderCollaborationSelection({ color: 'url(evil)' }).style
    ).not.toContain('evil');
  });
  it('renders a real Tiptap peer caret and highlights a remote range after Yjs sync', async () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const awarenessA = new Awareness(a);
    const awarenessB = new Awareness(b);
    const sync = 'wire';
    a.on('update', (update, origin) => {
      if (origin !== sync) Y.applyUpdate(b, update, sync);
    });
    b.on('update', (update, origin) => {
      if (origin !== sync) Y.applyUpdate(a, update, sync);
    });
    for (const [source, target] of [
      [awarenessA, awarenessB],
      [awarenessB, awarenessA],
    ] as const) {
      source.on(
        'update',
        (
          {
            added,
            updated,
            removed,
          }: { added: number[]; updated: number[]; removed: number[] },
          origin: unknown
        ) => {
          if (origin !== sync)
            applyAwarenessUpdate(
              target,
              encodeAwarenessUpdate(source, [...added, ...updated, ...removed]),
              sync
            );
        }
      );
    }
    const elements = [
      document.createElement('div'),
      document.createElement('div'),
    ];
    for (const element of elements) document.body.append(element);
    const editors = [
      [a, awarenessA, 'first'],
      [b, awarenessB, 'second'],
    ].map(
      ([doc, awareness, id], index) =>
        new Editor({
          element: elements[index],
          extensions: [
            StarterKit.configure({ undoRedo: false }),
            Collaboration.configure({
              document: doc as Y.Doc,
              field: 'prosemirror',
            }),
            CollaborationCaret.configure({
              provider: { awareness },
              user: { id, name: 'Alex', color: '#123456' },
              render: renderCollaborationCaret,
              selectionRender: renderCollaborationSelection,
            }),
          ],
        })
    );
    try {
      editors[0]!.commands.setContent('<p>Hello shared document</p>');
      await waitFor(() =>
        expect(editors[1]!.getText()).toBe('Hello shared document')
      );
      editors[0]!.view.focus();
      editors[0]!.commands.setTextSelection({ from: 2, to: 6 });
      await waitFor(() =>
        expect(
          elements[1]!.querySelector('.collaboration-carets__selection')
        ).not.toBeNull()
      );
      expect(
        elements[1]!.querySelector<HTMLElement>('.collaboration-carets__caret')
          ?.dataset.userId
      ).toBe('first');
      expect(
        elements[1]!.querySelector('.collaboration-carets__selection')
          ?.textContent
      ).toBe('ello');
    } finally {
      for (const editor of editors) editor.destroy();
      awarenessA.destroy();
      awarenessB.destroy();
      a.destroy();
      b.destroy();
      for (const element of elements) element.remove();
    }
  });
});
