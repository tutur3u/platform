import { mergeAttributes, Node } from '@tiptap/core';

export const CollapsibleSummary = Node.create({
  name: 'collapsibleSummary',
  content: 'inline*',
  defining: true,
  parseHTML() {
    return [{ tag: 'summary' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['summary', mergeAttributes(HTMLAttributes), 0];
  },
});

export const Collapsible = Node.create({
  name: 'collapsible',
  group: 'block',
  content: 'collapsibleSummary block+',
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: 'details' }];
  },
  renderHTML({ HTMLAttributes }) {
    // Keep authoring blocks open so their content is always directly editable.
    return ['details', mergeAttributes(HTMLAttributes, { open: '' }), 0];
  },
});
