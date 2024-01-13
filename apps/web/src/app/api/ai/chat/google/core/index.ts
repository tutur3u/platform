import { Message } from 'ai';

const normalize = (message: Message) => ({
  role: message.role === 'user' ? 'user' : 'model',
  parts: [{ text: message.content }],
});

export const normalizeMessages = (messages: Message[]) =>
  messages
    .filter(
      (message) => message.role === 'user' || message.role === 'assistant'
    )
    .map(normalize);

export function buildPrompt(messages: Message[]) {
  const normalizedMsgs = normalizeMessages(messages);
  return { contents: normalizedMsgs };
}
