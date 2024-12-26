import { mergeAttributes } from '@tiptap/core';
import type { Level } from '@tiptap/extension-heading';
import TiptapHeading from '@tiptap/extension-heading';

export const Heading = TiptapHeading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const nodeLevel = parseInt(node.attrs.level, 10) as Level;
    const hasLevel = this.options.levels?.includes(nodeLevel);
    const level = hasLevel ? nodeLevel : this.options.levels?.[0];

    return [
      `h${level}`,
      this.options.HTMLAttributes
        ? mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)
        : HTMLAttributes,
      0,
    ];
  },
});

export default Heading;
