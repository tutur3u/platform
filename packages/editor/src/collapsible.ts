import { mergeAttributes, Node } from '@tiptap/core';

export const CollapsibleSummary = Node.create({
  name: 'collapsibleSummary',
  content: 'inline*',
  defining: true,
  addOptions() {
    return { disclosureLabel: 'Expand or collapse section' };
  },
  addNodeView() {
    return () => {
      const dom = document.createElement('summary');
      const disclosure = document.createElement('button');
      const contentDOM = document.createElement('span');

      disclosure.type = 'button';
      disclosure.className = 'tuturuuu-editor-collapsible-toggle';
      disclosure.contentEditable = 'false';
      disclosure.setAttribute('aria-label', this.options.disclosureLabel);
      disclosure.setAttribute('aria-expanded', String(this.editor.isEditable));
      disclosure.setAttribute('title', this.options.disclosureLabel);
      disclosure.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const details = dom.closest('details');
        if (details) {
          details.open = !details.open;
          disclosure.setAttribute('aria-expanded', String(details.open));
        }
      });

      contentDOM.className = 'tuturuuu-editor-collapsible-summary-content';
      dom.append(disclosure, contentDOM);
      return {
        contentDOM,
        dom,
        ignoreMutation: (mutation) =>
          mutation.type === 'attributes' &&
          mutation.target === disclosure &&
          mutation.attributeName === 'aria-expanded',
      };
    };
  },
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
  addNodeView() {
    return () => {
      const dom = document.createElement('details');
      const syncDisclosureState = () => {
        dom
          .querySelector('.tuturuuu-editor-collapsible-toggle')
          ?.setAttribute('aria-expanded', String(dom.open));
      };

      dom.open = this.editor.isEditable;
      dom.addEventListener('toggle', syncDisclosureState);
      return {
        contentDOM: dom,
        destroy: () => dom.removeEventListener('toggle', syncDisclosureState),
        dom,
        ignoreMutation: (mutation) =>
          mutation.type === 'attributes' && mutation.attributeName === 'open',
      };
    };
  },
  addKeyboardShortcuts() {
    const removeAtBoundary = (direction: 'backward' | 'forward') =>
      this.editor.commands.command(({ dispatch, state }) => {
        const { $from, empty } = state.selection;
        if (!empty) return false;

        let collapsibleDepth = -1;
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if ($from.node(depth).type.name === this.name) {
            collapsibleDepth = depth;
            break;
          }
        }
        if (collapsibleDepth < 0) return false;

        const node = $from.node(collapsibleDepth);
        const nodeStart = $from.before(collapsibleDepth);
        const atSummaryStart =
          $from.parent.type.name === 'collapsibleSummary' &&
          $from.parentOffset === 0;
        const atLastBlockEnd =
          $from.parentOffset === $from.parent.content.size &&
          $from.pos === nodeStart + node.nodeSize - 2;
        if (
          (direction === 'backward' && !atSummaryStart) ||
          (direction === 'forward' && !atLastBlockEnd)
        ) {
          return false;
        }

        if (dispatch) {
          dispatch(state.tr.delete(nodeStart, nodeStart + node.nodeSize));
        }
        return true;
      });

    return {
      Backspace: () => removeAtBoundary('backward'),
      Delete: () => removeAtBoundary('forward'),
    };
  },
  parseHTML() {
    return [{ tag: 'details' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['details', mergeAttributes(HTMLAttributes), 0];
  },
});
