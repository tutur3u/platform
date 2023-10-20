import { Message } from 'ai';

export const initialPrompts: Message[] = [
  {
    id: 'initial-prompt',
    role: 'system',
    content:
      'Assistant, always format code blocks if there is any. On top of that, please do not paste any links or images in the content as it will be removed. Thank you.',
  },
];

export const trailingPrompts: Message[] = [
  {
    id: 'trailing-prompt',
    role: 'system',
    content:
      "Assistant, please utilize markdown (especially tables) to make the content more engaging and easier to read if possible. Additionally, don't mention that you will be using markdown in the content unless the user is the one who mentioned it first. Thank you.",
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
