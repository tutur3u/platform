import { ListItem } from '@tiptap/extension-list';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ListItemContent } from './list-item-view';

/**
 * Pure list-item extension.
 * Intentionally excludes all drag behavior and drag commands.
 */
export const ListItemBase = ListItem.extend({
  draggable: true,
  addNodeView() {
    return ReactNodeViewRenderer(ListItemContent);
  },
});
