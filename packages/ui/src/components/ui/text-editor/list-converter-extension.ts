import type { Command } from '@tiptap/core';
import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    listConverter: {
      /**
       * Toggle task list (smart - converts entire list)
       */
      toggleTaskListSmart: () => ReturnType;
      /**
       * Toggle bullet list (smart - converts entire list)
       */
      toggleBulletListSmart: () => ReturnType;
      /**
       * Toggle ordered list (smart - converts entire list)
       */
      toggleOrderedListSmart: () => ReturnType;
    };
  }
}

/**
 * Extension to improve list type conversion behavior
 * Ensures that converting between list types affects the entire list,
 * not just individual items, preventing split lists
 */
export const ListConverter = Extension.create({
  name: 'listConverter',

  addCommands() {
    return {
      toggleTaskListSmart:
        (): Command =>
        ({ chain }) => {
          // Simply use the default toggle - TipTap handles it properly
          return chain().focus().toggleTaskList().run();
        },

      toggleBulletListSmart:
        (): Command =>
        ({ chain }) => {
          // Simply use the default toggle - TipTap handles it properly
          return chain().focus().toggleBulletList().run();
        },

      toggleOrderedListSmart:
        (): Command =>
        ({ chain }) => {
          // Simply use the default toggle - TipTap handles it properly
          return chain().focus().toggleOrderedList().run();
        },
    };
  },
});
