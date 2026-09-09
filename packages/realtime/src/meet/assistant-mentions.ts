import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

export const MEET_ASSISTANT_USER_ID = '00000000-0000-4000-8000-000000000001';

/** Shared standalone handle boundaries for rendering and assistant requests. */
export function findMeetAssistantMentions(text: string) {
  return [
    ...text.matchAll(
      /(^|[\s([{"'“‘,:;!?*])(@(?:tuturuuu|ttr))(?![\p{L}\p{N}_-])/giu
    ),
  ].map((match) => ({
    start: match.index + match[1]!.length,
    end: match.index + match[0].length,
  }));
}

export function hasMeetAssistantMention(text: string) {
  const tree = fromMarkdown(text, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const visit = (node: {
    type: string;
    value?: string;
    children?: typeof tree.children;
  }): boolean => {
    if (
      ['code', 'inlineCode', 'link', 'linkReference', 'html'].includes(
        node.type
      )
    )
      return false;
    if (node.type === 'text')
      return findMeetAssistantMentions(node.value ?? '').length > 0;
    return node.children?.some(visit) ?? false;
  };
  return visit(tree);
}
