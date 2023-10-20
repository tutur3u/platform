import { Message } from 'ai';

export const initialPrompt: Message | null = null;

export function buildPrompt(data: Message[]) {
  const messages = initialPrompt ? [initialPrompt, ...data] : data;

  return (
    messages
      .map((message) => {
        // If there is 2 repeated substring in the
        // message, we will merge them into one
        const content = message.content;
        const contentLength = content.length;
        const contentHalfLength = Math.floor(contentLength / 2);

        const firstHalf = content.substring(0, contentHalfLength);

        const secondHalf = content.substring(contentHalfLength, contentLength);

        if (firstHalf === secondHalf) message.content = firstHalf;
        return message;
      })
      .map(({ content, role }) => {
        if (role === 'system') return content;
        if (role === 'user') return `Human: ${content}`;
        return `Assistant: ${content}`;
      })
      .join('\n\n') + '\n\nAssistant:'
  );
}
