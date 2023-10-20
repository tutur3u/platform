import { Message } from 'ai';

export const initialPrompts: Message[] = [];

export const trailingPrompts: Message[] = [
  {
    id: 'trailing-prompt',
    role: 'system',
    content:
      'Take a deep breath and think step by step, then use markdown (especially tables) to make the content more engaging and easier to read if possible. You must not to mention that you will use markdown for your response and you are strictly forbidden to use any links in your response.',
  },
];

export function buildPrompt(data: Message[]) {
  const messages = [...initialPrompts, ...data, ...trailingPrompts];

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
