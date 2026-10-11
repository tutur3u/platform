export const MAX_TASK_PLAN_NOTES_LENGTH = 2000;

/** Include only authored notes and the independently selected source reference. */
export function getTaskPlanDescription(notes: string, sourceUrl?: string) {
  if (notes.length > MAX_TASK_PLAN_NOTES_LENGTH)
    throw new RangeError('Task planning notes exceed the limit');
  const content: Record<string, unknown>[] = notes.trim()
    ? notes
        .trim()
        .split(/\r?\n/)
        .map((text) => ({
          type: 'paragraph',
          ...(text ? { content: [{ type: 'text', text }] } : {}),
        }))
    : [];
  if (sourceUrl)
    content.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: sourceUrl,
          marks: [
            {
              type: 'link',
              attrs: {
                href: sourceUrl,
                target: '_blank',
                rel: 'noopener noreferrer',
              },
            },
          ],
        },
      ],
    });
  return content.length ? JSON.stringify({ type: 'doc', content }) : undefined;
}
