import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

export const MEET_ASSISTANT_USER_ID = '00000000-0000-4000-8000-000000000001';

type MentionNode = {
  type: string;
  value?: string;
  children?: MentionNode[];
};

/** Shared standalone handle boundaries for rendering and assistant requests. */
export function findMeetAssistantMentions(
  text: string,
  precedingCharacter = '',
  followingCharacter = ''
) {
  const prefix = precedingCharacter.slice(-1);
  return [
    ...(prefix + text + followingCharacter.slice(0, 1)).matchAll(
      /(^|[\s([{"'“‘,:;!?])(@(?:tuturuuu|ttr))(?![\p{L}\p{N}_-])/giu
    ),
  ]
    .map((match) => ({
      start: match.index + match[1]!.length - prefix.length,
      end: match.index + match[0].length - prefix.length,
    }))
    .filter((match) => match.start >= 0 && match.end <= text.length);
}

function containsHtml(node: MentionNode): boolean {
  return node.type === 'html' || (node.children?.some(containsHtml) ?? false);
}

/** Resolve boundaries from visible text, including adjacent formatted/code/link text. */
export function getMeetAssistantMentions(tree: MentionNode) {
  let visible = '';
  const spans: { node: MentionNode; start: number; end: number }[] = [];
  const visit = (node: MentionNode, eligible: boolean) => {
    const block = ['paragraph', 'heading', 'tableCell'].includes(node.type);
    if (block) visible += '\n';
    const allowed = eligible && !(block && containsHtml(node));
    if (node.type === 'text') {
      const start = visible.length;
      visible += node.value ?? '';
      if (allowed) spans.push({ node, start, end: visible.length });
    } else if (node.type === 'inlineCode') {
      visible += node.value ?? '';
    } else if (node.type === 'code') {
      visible += `\n${node.value ?? ''}\n`;
    } else if (
      ['html', 'break', 'image', 'imageReference'].includes(node.type)
    ) {
      visible += '\n';
    } else {
      const childrenAllowed =
        allowed && !['link', 'linkReference'].includes(node.type);
      for (const child of node.children ?? []) visit(child, childrenAllowed);
    }
    if (block) visible += '\n';
  };
  visit(tree, true);
  const mentions = new Map<MentionNode, { start: number; end: number }[]>();
  for (const span of spans) {
    const matches = findMeetAssistantMentions(
      span.node.value ?? '',
      visible[span.start - 1] ?? '',
      visible[span.end] ?? ''
    );
    if (matches.length) mentions.set(span.node, matches);
  }
  return mentions;
}

export function hasMeetAssistantMention(text: string) {
  const tree = fromMarkdown(text, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  return getMeetAssistantMentions(tree).size > 0;
}
