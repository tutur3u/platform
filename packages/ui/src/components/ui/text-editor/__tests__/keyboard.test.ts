import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { describe, expect, it, vi } from 'vitest';
import { handleListIndentation, handlePlainEnterFallback } from '../keyboard';

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
    orderedList: {
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

function stateWithSelection(
  doc: ReturnType<typeof schema.node>,
  offset = 1,
  targetText?: string
) {
  let textStart: number | null = null;

  doc.descendants((node, pos) => {
    if (
      textStart === null &&
      node.isText &&
      (!targetText || node.text === targetText)
    ) {
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

function tabEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    key: 'Tab',
    metaKey: false,
    preventDefault: vi.fn(),
    shiftKey: false,
    stopPropagation: vi.fn(),
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

  it.each(['bulletList', 'orderedList'] as const)(
    'indents and outdents a second %s item with Tab and Shift+Tab',
    (listType) => {
      const state = stateWithSelection(
        schema.node('doc', null, [
          schema.node(listType, null, [
            schema.node('listItem', null, [
              schema.node('paragraph', null, schema.text('first')),
            ]),
            schema.node('listItem', null, [
              schema.node('paragraph', null, schema.text('second')),
            ]),
          ]),
        ]),
        1,
        'second'
      );
      const { view, getState } = viewForState(state);
      const indentEvent = tabEvent();

      expect(handleListIndentation(view, indentEvent)).toBe(true);
      expect(indentEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(indentEvent.stopPropagation).toHaveBeenCalledTimes(1);
      expect(getState().doc.toJSON()).toMatchObject({
        content: [
          {
            type: listType,
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph' },
                  {
                    type: listType,
                    content: [{ type: 'listItem' }],
                  },
                ],
              },
            ],
          },
        ],
      });

      const outdentEvent = tabEvent({ shiftKey: true });
      expect(handleListIndentation(view, outdentEvent)).toBe(true);
      expect(getState().doc.child(0).childCount).toBe(2);
    }
  );

  it('indents and outdents checklist items', () => {
    const state = stateWithSelection(
      schema.node('doc', null, [
        schema.node('taskList', null, [
          schema.node('taskItem', null, [
            schema.node('paragraph', null, schema.text('first')),
          ]),
          schema.node('taskItem', null, [
            schema.node('paragraph', null, schema.text('second')),
          ]),
        ]),
      ]),
      1,
      'second'
    );
    const { view, getState } = viewForState(state);

    expect(handleListIndentation(view, tabEvent())).toBe(true);
    expect(getState().doc.toJSON()).toMatchObject({
      content: [
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              content: [
                { type: 'paragraph' },
                {
                  type: 'taskList',
                  content: [{ type: 'taskItem' }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(handleListIndentation(view, tabEvent({ shiftKey: true }))).toBe(
      true
    );
    expect(getState().doc.child(0).childCount).toBe(2);
  });

  it('does not consume Tab outside a list or when the first item cannot indent', () => {
    const paragraph = viewForState(
      stateWithSelection(
        schema.node('doc', null, [
          schema.node('paragraph', null, schema.text('plain')),
        ])
      )
    );
    const paragraphEvent = tabEvent();

    expect(handleListIndentation(paragraph.view, paragraphEvent)).toBe(false);
    expect(paragraphEvent.preventDefault).not.toHaveBeenCalled();

    const firstItem = viewForState(
      stateWithSelection(
        schema.node('doc', null, [
          schema.node('bulletList', null, [
            schema.node('listItem', null, [
              schema.node('paragraph', null, schema.text('only')),
            ]),
          ]),
        ])
      )
    );
    const firstItemEvent = tabEvent();

    expect(handleListIndentation(firstItem.view, firstItemEvent)).toBe(false);
    expect(firstItemEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('does not hijack modified Tab shortcuts', () => {
    const state = stateWithSelection(
      schema.node('doc', null, [
        schema.node('bulletList', null, [
          schema.node('listItem', null, [
            schema.node('paragraph', null, schema.text('first')),
          ]),
          schema.node('listItem', null, [
            schema.node('paragraph', null, schema.text('second')),
          ]),
        ]),
      ]),
      1,
      'second'
    );
    const { view } = viewForState(state);

    expect(handleListIndentation(view, tabEvent({ metaKey: true }))).toBe(
      false
    );
  });
});
