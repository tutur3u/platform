import {
  getMeetAssistantMentions,
  MEET_ASSISTANT_USER_ID as MEET_ASSISTANT_ID,
} from '@tuturuuu/realtime/meet';

export { MEET_ASSISTANT_ID };

let mentionMarker: string | undefined;

// Generate during rendering, retaining one unguessable marker per module instance.
export function getMeetMentionMarker(): string {
  mentionMarker ??= `meet-mention:${crypto.randomUUID()}`;
  return mentionMarker;
}
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
  url?: string;
  title?: string | null;
  children?: MarkdownNode[];
};

/** Transform text nodes only: code, existing links and raw HTML stay untouched. */
export function remarkMeetMentions() {
  return (tree: MarkdownNode) => {
    const mentions = getMeetAssistantMentions(tree);
    const visit = (node: MarkdownNode) => {
      if (
        ['code', 'inlineCode', 'link', 'linkReference', 'html'].includes(
          node.type
        )
      )
        return;
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          visit(child);
          return [child];
        }
        const value = child.value;
        const matches = mentions.get(child);
        if (!matches?.length) return [child];
        const result: MarkdownNode[] = [];
        let end = 0;
        for (const match of matches) {
          const start = match.start;
          if (start > end)
            result.push({ type: 'text', value: value.slice(end, start) });
          result.push({
            type: 'link',
            url: MEET_ASSISTANT_PROFILE,
            title: getMeetMentionMarker(),
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
