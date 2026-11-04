import { createEmptyCmsPage } from '@tuturuuu/cms-blocks/schema';
import { describe, expect, it } from 'vitest';
import {
  createEditorState,
  type EditorAction,
  type EditorState,
  editorReducer,
  findBlock,
} from './editor-state';

function run(...actions: EditorAction[]) {
  return actions.reduce<EditorState>(
    editorReducer,
    createEditorState(createEmptyCmsPage('Home'))
  );
}

const ids = (state: EditorState) =>
  state.page.content.map((block) => block.props.id);
const insert = (
  id: string,
  index: number,
  blockType = 'Spacer',
  zone = 'root'
): EditorAction =>
  ({ blockType, id, index, type: 'insert', zone }) as EditorAction;

describe('page builder editor state', () => {
  it('inserts, reorders and selects blocks', () => {
    const state = run(insert('a', 0), insert('b', 1), insert('c', 2), {
      id: 'a',
      index: 3,
      type: 'move',
      zone: 'root',
    });
    expect(ids(state)).toEqual(['b', 'c', 'a']);
    expect(state.selectedId).toBe('c');
  });

  it('moves blocks into nested column zones but rejects nested layouts', () => {
    const state = run(
      insert('cols', 0, 'TwoColumn'),
      insert('img', 1, 'Image'),
      insert('cols2', 2, 'TwoColumn'),
      {
        id: 'img',
        index: 0,
        type: 'move',
        zone: 'cols:left',
      }
    );
    expect(findBlock(state.page, 'img')?.zone).toBe('cols:left');
    const rejected = editorReducer(state, {
      id: 'cols2',
      index: 0,
      type: 'move',
      zone: 'cols:right',
    });
    expect(rejected).toBe(state);
    const intoItself = editorReducer(state, {
      id: 'cols',
      index: 0,
      type: 'move',
      zone: 'cols:left',
    });
    expect(intoItself).toBe(state);
  });

  it('updates, duplicates and removes blocks', () => {
    let state = run(insert('hero', 0, 'Hero'));
    state = editorReducer(state, {
      id: 'hero',
      props: { title: 'IEEAI' },
      type: 'update',
    });
    state = editorReducer(state, {
      id: 'hero',
      newId: 'hero-2',
      type: 'duplicate',
    });
    expect(ids(state)).toEqual(['hero', 'hero-2']);
    expect(findBlock(state.page, 'hero-2')?.block.props).toMatchObject({
      title: 'IEEAI',
    });
    state = editorReducer(state, { id: 'hero-2', type: 'remove' });
    expect(ids(state)).toEqual(['hero']);
    expect(state.selectedId).toBeNull();
  });

  it('ignores schema-invalid updates', () => {
    const state = run(insert('s', 0));
    expect(
      editorReducer(state, { id: 's', props: { size: 'huge' }, type: 'update' })
    ).toBe(state);
  });

  it('coalesces consecutive edits of one field into a single undo step', () => {
    let state = run(insert('hero', 0, 'Hero'));
    for (const title of ['I', 'IE', 'IEEAI']) {
      state = editorReducer(state, {
        id: 'hero',
        props: { title },
        type: 'update',
      });
    }
    expect(state.past).toHaveLength(2);
    state = editorReducer(state, { type: 'undo' });
    expect(findBlock(state.page, 'hero')?.block.props).toMatchObject({
      title: 'Page title',
    });
  });

  it('undoes and redoes edits', () => {
    let state = run(insert('a', 0), insert('b', 1));
    state = editorReducer(state, { type: 'undo' });
    expect(ids(state)).toEqual(['a']);
    state = editorReducer(state, { type: 'redo' });
    expect(ids(state)).toEqual(['a', 'b']);
    state = editorReducer(
      editorReducer(state, { type: 'undo' }),
      insert('c', 1)
    );
    expect(state.future).toEqual([]);
    expect(editorReducer(run(), { type: 'undo' }).past).toEqual([]);
  });
});
