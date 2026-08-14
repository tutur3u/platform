import {
  Extension,
  findParentNode,
  type JSONContent,
  mergeAttributes,
} from '@tiptap/core';
import {
  DetailsSummary,
  type DetailsSummaryOptions,
} from '@tiptap/extension-details';
import { Fragment } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';

export type ToggleHeadingLevel = 1 | 2 | 3 | null;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toggleBlock: {
      /** Convert the selected blocks to a Notion-style toggle, or unwrap it. */
      toggleDetailsBlock: () => ReturnType;
    };
  }
}

function parseHeadingLevel(element: HTMLElement): ToggleHeadingLevel {
  const level = Number(element.dataset.headingLevel);
  return level === 1 || level === 2 || level === 3 ? level : null;
}

export const ToggleSummary = DetailsSummary.extend<DetailsSummaryOptions>({
  addAttributes() {
    return {
      level: {
        default: null,
        parseHTML: parseHeadingLevel,
        renderHTML: ({ level }: { level: ToggleHeadingLevel }) =>
          level ? { 'data-heading-level': String(level) } : {},
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'summary',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },
});

function summaryFromBlock(block: JSONContent | undefined) {
  const isTextBlock = block?.type === 'paragraph' || block?.type === 'heading';
  const level =
    block?.type === 'heading' && [1, 2, 3].includes(block.attrs?.level)
      ? (block.attrs?.level as 1 | 2 | 3)
      : null;

  return {
    summary: {
      type: 'detailsSummary',
      attrs: { level },
      content: isTextBlock ? block.content : undefined,
    } satisfies JSONContent,
    consumedFirstBlock: isTextBlock,
  };
}

export const ToggleBlock = Extension.create({
  name: 'toggleBlock',

  addCommands() {
    return {
      toggleDetailsBlock:
        () =>
        ({ state, dispatch }) => {
          const detailsType = state.schema.nodes.details;
          if (!detailsType) return false;

          const existing = findParentNode((node) => node.type === detailsType)(
            state.selection
          );

          if (existing) {
            const summary = existing.node.child(0);
            const detailsContent = existing.node.child(1);
            const level = summary.attrs.level as ToggleHeadingLevel;
            const summaryType = level
              ? state.schema.nodes.heading
              : state.schema.nodes.paragraph;
            if (!summaryType) return false;

            if (dispatch) {
              const restoredSummary = summaryType.create(
                level ? { level } : undefined,
                summary.content
              );
              const restoredNodes = [
                restoredSummary,
                ...detailsContent.content.content,
              ];
              const transaction = state.tr.replaceWith(
                existing.pos,
                existing.pos + existing.node.nodeSize,
                Fragment.fromArray(restoredNodes)
              );
              transaction.setSelection(
                TextSelection.create(transaction.doc, existing.pos + 1)
              );
              dispatch(transaction.scrollIntoView());
            }

            return true;
          }

          const { $from, $to } = state.selection;
          const range = $from.blockRange($to);
          if (!range) return false;

          const selected = state.doc.slice(range.start, range.end).toJSON()
            .content as JSONContent[] | undefined;
          if (!selected?.length) return false;

          const { summary, consumedFirstBlock } = summaryFromBlock(selected[0]);
          const body = consumedFirstBlock ? selected.slice(1) : selected;

          if (dispatch) {
            const details = state.schema.nodeFromJSON({
              type: 'details',
              attrs: { open: true },
              content: [
                summary,
                {
                  type: 'detailsContent',
                  content: body.length ? body : [{ type: 'paragraph' }],
                },
              ],
            });
            const transaction = state.tr.replaceWith(
              range.start,
              range.end,
              details
            );
            transaction.setSelection(
              TextSelection.create(transaction.doc, range.start + 2)
            );
            dispatch(transaction.scrollIntoView());
          }

          return true;
        },
    };
  },
});
