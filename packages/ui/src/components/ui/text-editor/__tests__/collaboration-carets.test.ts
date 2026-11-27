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
  observeCollaborationCarets,
  positionCollaborationCaretLabel,
  renderCollaborationCaret,
  renderCollaborationSelection,
  scrollToCollaborationCaret,
  updateCollaborationCaretPlacements,
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

  it('flips caret name pills below the caret near the top edge and keeps them above lower down', () => {
    const editorRoot = document.createElement('div');
    editorRoot.className = 'ProseMirror';
    const firstBlock = document.createElement('h1');
    const secondBlock = document.createElement('p');
    const topCaret = renderCollaborationCaret({
      id: 'top',
      name: 'vmkhoiii',
      color: '#e11d48',
    });
    const lowerCaret = renderCollaborationCaret({
      id: 'lower',
      name: 'Alex',
      color: '#2563eb',
    });
    firstBlock.append(topCaret);
    secondBlock.append(lowerCaret);
    editorRoot.append(firstBlock, secondBlock);
    document.body.append(editorRoot);
    try {
      const topLabel = topCaret.querySelector<HTMLElement>(
        '.collaboration-carets__label'
      )!;
      const lowerLabel = lowerCaret.querySelector<HTMLElement>(
        '.collaboration-carets__label'
      )!;
      editorRoot.getBoundingClientRect = () =>
        ({ top: 100, height: 400 }) as DOMRect;
      topCaret.getBoundingClientRect = () =>
        ({ top: 108, height: 32 }) as DOMRect;
      lowerCaret.getBoundingClientRect = () =>
        ({ top: 180, height: 20 }) as DOMRect;
      topLabel.getBoundingClientRect = () => ({ height: 18 }) as DOMRect;
      lowerLabel.getBoundingClientRect = () => ({ height: 18 }) as DOMRect;

      positionCollaborationCaretLabel(topCaret, topLabel);
      expect(topLabel.dataset.placement).toBe('bottom');
      expect(topLabel.style.top).toBe('calc(100% + 2px)');

      updateCollaborationCaretPlacements(editorRoot);
      expect(lowerLabel.dataset.placement).toBe('top');
      expect(lowerLabel.style.top).toBe('-1.4em');
    } finally {
      editorRoot.remove();
    }
  });

  it('clears a sticky toolbar inside an overflow scrollport and falls back when caret height is zero', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    const toolbar = document.createElement('div');
    toolbar.style.position = 'sticky';
    const editorRoot = document.createElement('div');
    editorRoot.className = 'ProseMirror';
    const firstBlock = document.createElement('h1');
    const secondBlock = document.createElement('p');
    const underToolbarCaret = renderCollaborationCaret({
      id: 'under-toolbar',
      name: 'vmkhoiii',
      color: '#e11d48',
    });
    const zeroHeightFirstCaret = renderCollaborationCaret({
      id: 'zero-first',
      name: 'ZeroFirst',
      color: '#2563eb',
    });
    const zeroHeightSecondCaret = renderCollaborationCaret({
      id: 'zero-second',
      name: 'ZeroSecond',
      color: '#16a34a',
    });
    firstBlock.append(zeroHeightFirstCaret);
    secondBlock.append(underToolbarCaret, zeroHeightSecondCaret);
    editorRoot.append(firstBlock, secondBlock);
    scroller.append(toolbar, editorRoot);
    document.body.append(scroller);
    try {
      scroller.getBoundingClientRect = () =>
        ({ top: 100, bottom: 500, height: 400 }) as DOMRect;
      toolbar.getBoundingClientRect = () =>
        ({ top: 100, bottom: 148, height: 48 }) as DOMRect;
      editorRoot.getBoundingClientRect = () =>
        ({ top: 100, bottom: 500, height: 400 }) as DOMRect;
      // 155 is 55px below scroller/editor top (would stay above without sticky
      // toolbar), but only 7px below the sticky toolbar's bottom (148).
      underToolbarCaret.getBoundingClientRect = () =>
        ({ top: 155, bottom: 175, height: 20 }) as DOMRect;
      zeroHeightFirstCaret.getBoundingClientRect = () =>
        ({ top: 0, bottom: 0, height: 0 }) as DOMRect;
      zeroHeightSecondCaret.getBoundingClientRect = () =>
        ({ top: 0, bottom: 0, height: 0 }) as DOMRect;

      const underLabel = underToolbarCaret.querySelector<HTMLElement>(
        '.collaboration-carets__label'
      )!;
      const zeroFirstLabel = zeroHeightFirstCaret.querySelector<HTMLElement>(
        '.collaboration-carets__label'
      )!;
      const zeroSecondLabel = zeroHeightSecondCaret.querySelector<HTMLElement>(
        '.collaboration-carets__label'
      )!;
      underLabel.getBoundingClientRect = () => ({ height: 18 }) as DOMRect;

      updateCollaborationCaretPlacements(scroller);
      expect(underLabel.dataset.placement).toBe('bottom');
      expect(zeroFirstLabel.dataset.placement).toBe('bottom');
      expect(zeroSecondLabel.dataset.placement).toBe('top');
    } finally {
      scroller.remove();
    }
  });

  it('repositions a reused caret when awareness changes without a local scroll', async () => {
    const editorRoot = document.createElement('div');
    editorRoot.className = 'ProseMirror';
    const caret = renderCollaborationCaret({
      id: 'moving',
      name: 'Alex',
      color: '#2563eb',
    });
    editorRoot.append(caret);
    document.body.append(editorRoot);
    const listeners = new Set<() => void>();
    const awareness = {
      on: (_event: 'change', listener: () => void) => listeners.add(listener),
      off: (_event: 'change', listener: () => void) =>
        listeners.delete(listener),
    };
    const label = caret.querySelector<HTMLElement>(
      '.collaboration-carets__label'
    )!;
    let caretTop = 220;
    editorRoot.getBoundingClientRect = () =>
      ({ top: 100, bottom: 500, height: 400 }) as DOMRect;
    caret.getBoundingClientRect = () =>
      ({ top: caretTop, bottom: caretTop + 20, height: 20 }) as DOMRect;
    label.getBoundingClientRect = () => ({ height: 18 }) as DOMRect;

    const stop = observeCollaborationCarets(editorRoot, awareness);
    try {
      await waitFor(() => expect(label.dataset.placement).toBe('top'));
      caretTop = 106;
      for (const listener of listeners) listener();
      await waitFor(() => expect(label.dataset.placement).toBe('bottom'));
    } finally {
      stop();
      editorRoot.remove();
    }
  });
});
