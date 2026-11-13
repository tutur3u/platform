import {
  type CmsBlockType,
  cmsBlockRegistry,
  cmsBlockTypes,
  createEmptyCmsPage,
} from '@tuturuuu/cms-blocks/schema';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import vi from '../../../messages/vi.json';
import { createEditorState, editorReducer } from './editor-state';

const addedTypes = [
  'Section',
  'Heading',
  'Gallery',
  'Embed',
  'Accordion',
  'Divider',
] satisfies CmsBlockType[];

describe('extended block registry in the editor', () => {
  it.each(addedTypes)('inserts %s using registry defaults', (blockType) => {
    const state = editorReducer(
      createEditorState(createEmptyCmsPage('Draft')),
      {
        blockType,
        id: 'new-block',
        index: 0,
        type: 'insert',
        zone: 'root',
      }
    );
    expect(state.page.content).toEqual([
      {
        props: { ...cmsBlockRegistry[blockType].defaults, id: 'new-block' },
        type: blockType,
      },
    ]);
    expect(state.selectedId).toBe('new-block');
  });

  it.each([en, vi])(
    'labels every palette block and visible inspector field',
    (messages) => {
      const labels = messages['external-projects'].page_builder;
      expect(cmsBlockTypes).toHaveLength(15);
      for (const type of cmsBlockTypes) {
        expect(labels.blocks).toHaveProperty(type, expect.any(String));
        expect(labels.categories).toHaveProperty(
          cmsBlockRegistry[type].category
        );
        for (const [name, field] of Object.entries(
          cmsBlockRegistry[type].fields
        )) {
          if (field.kind !== 'list' && field.kind !== 'zone') {
            expect(labels.fields).toHaveProperty(name, expect.any(String));
          }
        }
      }
    }
  );
});
