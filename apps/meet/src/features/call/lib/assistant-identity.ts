import {
  findMeetAssistantMentions,
  MEET_ASSISTANT_USER_ID as MEET_ASSISTANT_ID,
  meetMentionPrecedingCharacter,
} from '@tuturuuu/realtime/meet';

export { MEET_ASSISTANT_ID };
// A renderer-local marker survives sanitization without treating authored URLs as mentions.
export const MEET_MENTION_MARKER = `meet-mention:${crypto.randomUUID()}`;
export const MEET_ASSISTANT_PROFILE =
  'https://meet.tuturuuu.com/#tuturuuu-assistant';

export function isMeetAssistant(message: {
  userId: string;
  assistant?: boolean;
}) {
  return message.assistant === true && message.userId === MEET_ASSISTANT_ID;
}

type MarkdownNode = {
  type: string;
  value?: string;
  position?: { start: { offset?: number } };
  url?: string;
  title?: string | null;
  children?: MarkdownNode[];
};

/** Transform text nodes only: code, existing links and raw HTML stay untouched. */
export function remarkMeetMentions() {
  return (tree: MarkdownNode, file?: { value?: unknown }) => {
    const source = String(file?.value ?? '');
    const visit = (node: MarkdownNode) => {
      if (
        ['code', 'inlineCode', 'link', 'linkReference', 'html'].includes(
          node.type
        )
      )
        return;
      // Match request detection: raw HTML paragraphs do not invoke Mira.
      if (node.children?.some((child) => child.type === 'html')) return;
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          visit(child);
          return [child];
        }
        const value = child.value;
        const offset = child.position?.start.offset ?? 0;
        const matches = findMeetAssistantMentions(
          value,
          meetMentionPrecedingCharacter(source, offset)
        );
        if (!matches.length) return [child];
        const result: MarkdownNode[] = [];
        let end = 0;
        for (const match of matches) {
          const start = match.start;
          if (start > end)
            result.push({ type: 'text', value: value.slice(end, start) });
          result.push({
            type: 'link',
            url: MEET_ASSISTANT_PROFILE,
            title: MEET_MENTION_MARKER,
            children: [{ type: 'text', value: value.slice(start, match.end) }],
          });
          end = match.end;
        }
        if (end < value.length)
          result.push({ type: 'text', value: value.slice(end) });
        return result;
      });
    };
    visit(tree);
  };
}
