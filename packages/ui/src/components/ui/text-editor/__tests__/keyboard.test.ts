import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { describe, expect, it, vi } from 'vitest';
import { handlePlainEnterFallback } from '../keyboard';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
    },
    bulletList: {
      group: 'block',
      content: 'listItem+',
    },
    listItem: {
      content: 'paragraph block*',
      defining: true,
    },
    taskList: {
      group: 'block',
      content: 'taskItem+',
    },
    taskItem: {
      content: 'paragraph block*',
      defining: true,
    },
    codeBlock: {
      group: 'block',
      content: 'text*',
      code: true,
    },
    text: { group: 'inline' },
  },
  marks: {},
});

function stateWithSelection(doc: ReturnType<typeof schema.node>, offset = 1) {
  let textStart: number | null = null;

  doc.descendants((node, pos) => {
    if (textStart === null && node.isText) {
      textStart = pos;
      return false;
    }

    return true;
  });

  const selectionPosition = (textStart ?? 1) + offset;

  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, selectionPosition),
  });
}

function enterEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    key: 'Enter',
    metaKey: false,
    preventDefault: vi.fn(),
    shiftKey: false,
    ...overrides,
  } as unknown as KeyboardEvent;
}

function viewForState(state: EditorState) {
  let currentState = state;
  const view = {
    get state() {
      return currentState;
    },
    dispatch(transaction) {
      currentState = currentState.apply(transaction);
    },
  } as EditorView;

  return {
    getState: () => currentState,
    view,
  };
}

describe('text editor keyboard handling', () => {
  it('splits a normal paragraph on plain Enter', () => {
    const state = stateWithSelection(
      schema.node('doc', null, [
        schema.node('paragraph', null, schema.text('hello')),
      ]),
      2
    );
    const { view, getState } = viewForState(state);
    const event = enterEvent();

    expect(handlePlainEnterFallback(view, event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(getState().doc.toJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'he' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'llo' }],
        },
      ],
    });
  });

  it('leaves list item Enter handling to list extensions', () => {
    const state = stateWithSelection(
      schema.node('doc', null, [
        schema.node('bulletList', null, [
          schema.node('listItem', null, [
            schema.node('paragraph', null, schema.text('item')),
          ]),
        ]),
      ])
    );
    const { view } = viewForState(state);
    const event = enterEvent();

    expect(handlePlainEnterFallback(view, event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves task item Enter handling to task-list extensions', () => {
    const state = stateWithSelection(
      schema.node('doc', null, [
        schema.node('taskList', null, [
          schema.node('taskItem', null, [
            schema.node('paragraph', null, schema.text('todo')),
          ]),
        ]),
      ])
    );
    const { view } = viewForState(state);
    const event = enterEvent();

    expect(handlePlainEnterFallback(view, event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves Shift+Enter available for hard-break handling', () => {
    const state = stateWithSelection(
      schema.node('doc', null, [
        schema.node('paragraph', null, schema.text('hello')),
      ])
    );
    const { view } = viewForState(state);
    const event = enterEvent({ shiftKey: true });

    expect(handlePlainEnterFallback(view, event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves code block Enter handling to code extensions', () => {
    const state = stateWithSelection(
      schema.node('doc', null, [
        schema.node('codeBlock', null, schema.text('const value = 1;')),
      ])
    );
    const { view } = viewForState(state);
    const event = enterEvent();

    expect(handlePlainEnterFallback(view, event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
