import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

export const MEET_ASSISTANT_USER_ID = '00000000-0000-4000-8000-000000000001';

/** Shared standalone handle boundaries for rendering and assistant requests. */
export function findMeetAssistantMentions(
  text: string,
  precedingCharacter = ''
) {
  const prefix = precedingCharacter.slice(-1);
  return [
    ...(prefix + text).matchAll(
      /(^|[\s([{"'“‘,:;!?*])(@(?:tuturuuu|ttr))(?![\p{L}\p{N}_-])/giu
    ),
  ].map((match) => ({
    start: match.index + match[1]!.length - prefix.length,
    end: match.index + match[0].length - prefix.length,
  }));
}

/** Formatting markers do not create a new word boundary. */
export function meetMentionPrecedingCharacter(source: string, offset = 0) {
  let index = offset - 1;
  while (index >= 0 && '*_~'.includes(source[index]!)) index--;
  return source[index] ?? '';
}

export function hasMeetAssistantMention(text: string) {
  const tree = fromMarkdown(text, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const visit = (node: {
    type: string;
    value?: string;
    position?: { start: { offset?: number } };
    children?: typeof tree.children;
  }): boolean => {
    if (
      ['code', 'inlineCode', 'link', 'linkReference', 'html'].includes(
        node.type
      )
    )
      return false;
    // Raw HTML fragments have no trustworthy Markdown text boundaries.
    if (node.children?.some((child) => child.type === 'html')) return false;
    if (node.type === 'text')
      return (
        findMeetAssistantMentions(
          node.value ?? '',
          meetMentionPrecedingCharacter(text, node.position?.start.offset)
        ).length > 0
      );
    return node.children?.some(visit) ?? false;
  };
  return visit(tree);
}
