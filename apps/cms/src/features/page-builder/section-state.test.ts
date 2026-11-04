import { createEmptyCmsPage } from '@tuturuuu/cms-blocks/schema';
import { describe, expect, it } from 'vitest';
import { createEditorState, editorReducer, findBlock } from './editor-state';

function initial() {
  return editorReducer(createEditorState(createEmptyCmsPage()), {
    type: 'insert',
    blockType: 'Section',
    id: 'section',
    zone: 'root',
    index: 0,
  });
}
describe('Section children editing', () => {
  it('inserts, edits and undoes a child in its Section', () => {
    let state = editorReducer(initial(), {
      type: 'insert',
      blockType: 'Heading',
      id: 'heading',
      zone: 'section:children',
      index: 0,
    });
    expect(findBlock(state.page, 'heading')?.zone).toBe('section:children');
    state = editorReducer(state, {
      type: 'update',
      id: 'heading',
      props: { text: 'Edited child' },
    });
    expect(findBlock(state.page, 'heading')?.block.props).toMatchObject({
      text: 'Edited child',
    });
    state = editorReducer(state, { type: 'undo' });
    expect(findBlock(state.page, 'heading')?.block.props).not.toMatchObject({
      text: 'Edited child',
    });
  });
  it('moves a leaf into and out of Section children without losing it', () => {
    let state = initial();
    state = editorReducer(state, {
      type: 'insert',
      blockType: 'Image',
      id: 'image',
      zone: 'root',
      index: 1,
    });
    state = editorReducer(state, {
      type: 'move',
      id: 'image',
      zone: 'section:children',
      index: 0,
    });
    expect(findBlock(state.page, 'image')?.zone).toBe('section:children');
    state = editorReducer(state, {
      type: 'move',
      id: 'image',
      zone: 'root',
      index: 1,
    });
    expect(findBlock(state.page, 'image')?.zone).toBe('root');
  });
  it('duplicates the Section with unique child IDs and supports child removal', () => {
    let state = editorReducer(initial(), {
      type: 'insert',
      blockType: 'Heading',
      id: 'child',
      zone: 'section:children',
      index: 0,
    });
    state = editorReducer(state, {
      type: 'duplicate',
      id: 'section',
      newId: 'copy',
    });
    expect(findBlock(state.page, 'copy-child')?.zone).toBe('copy:children');
    state = editorReducer(state, { type: 'remove', id: 'child' });
    expect(findBlock(state.page, 'child')).toBeNull();
    expect(findBlock(state.page, 'copy-child')).not.toBeNull();
  });
  it('rejects layout nesting and missing target zones without deleting the source', () => {
    let state = initial();
    state = editorReducer(state, {
      type: 'insert',
      blockType: 'TwoColumn',
      id: 'columns',
      zone: 'root',
      index: 1,
    });
    expect(
      editorReducer(state, {
        type: 'move',
        id: 'columns',
        zone: 'section:children',
        index: 0,
      })
    ).toBe(state);
    expect(
      editorReducer(state, {
        type: 'move',
        id: 'columns',
        zone: 'missing:children',
        index: 0,
      })
    ).toBe(state);
    expect(
      editorReducer(state, {
        type: 'insert',
        blockType: 'Section',
        id: 'nested',
        zone: 'section:children',
        index: 0,
      })
    ).toBe(state);
  });
});
