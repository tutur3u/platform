import { TaskItem } from '@tiptap/extension-list';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TaskItemCheckboxView } from './task-item-checkbox-view';

/**
 * Task item extension with tri-state checkbox support.
 * `checked` supports: false | 'indeterminate' | true
 */
export const TaskItemCheckbox = TaskItem.extend({
  addAttributes() {
    return {
      checked: {
        default: false,
        keepOnSplit: false,
        parseHTML: (element: HTMLElement) => {
          const dataChecked = element.getAttribute('data-checked');
          if (dataChecked === 'indeterminate') return 'indeterminate';
          return dataChecked === '' || dataChecked === 'true';
        },
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-checked': String(attributes.checked),
        }),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskItemCheckboxView);
  },
}).configure({
  nested: true,
});
