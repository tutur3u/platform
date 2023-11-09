import { AI_PROMPT, HUMAN_PROMPT } from '@anthropic-ai/sdk';
import { Message } from 'ai';

export const filterDuplicate = (str: string) => {
  const strLength = str.length;
  const halfLength = Math.floor(strLength / 2);
  const firstHalf = str.substring(0, halfLength);
  const secondHalf = str.substring(halfLength, strLength);

  if (firstHalf !== secondHalf) return str;
  return firstHalf;
};

export const filterDuplicates = (messages: Message[]) =>
  // If there is 2 repeated substring in the
  // message, we will merge them into one
  messages.map((message) => {
    return { ...message, content: filterDuplicate(message.content) };
  });

export const normalize = (message: Message) => {
  const { content, role } = message;
  if (role === 'user') return `${HUMAN_PROMPT} ${content}`;
  if (role === 'assistant') return `${AI_PROMPT} ${content}`;
  return content;
};

export const filterSystemMessages = (messages: Message[]) =>
  messages.filter((message) => message.role !== 'system');
