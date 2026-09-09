export const MEET_ASSISTANT_ID = '00000000-0000-4000-8000-000000000001';
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
  children?: MarkdownNode[];
};

/** Transform text nodes only: code, existing links and raw HTML stay untouched. */
export function remarkMeetMentions() {
  return (tree: MarkdownNode) => {
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
        const matches = [...value.matchAll(/(^|[\s(])(@tuturuuu)\b/gi)];
        if (!matches.length) return [child];
        const result: MarkdownNode[] = [];
        let end = 0;
        for (const match of matches) {
          const start = match.index + match[1]!.length;
          if (start > end)
            result.push({ type: 'text', value: value.slice(end, start) });
          result.push({
            type: 'link',
            url: MEET_ASSISTANT_PROFILE,
            children: [{ type: 'text', value: '@Tuturuuu' }],
          });
          end = start + match[2]!.length;
        }
        if (end < value.length)
          result.push({ type: 'text', value: value.slice(end) });
        return result;
      });
    };
    visit(tree);
  };
}
