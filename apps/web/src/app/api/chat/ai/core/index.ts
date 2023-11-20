import { AI_PROMPT, HUMAN_PROMPT } from '@anthropic-ai/sdk';
import { Message } from 'ai';

const leadingMessages: Message[] = [
  {
    id: 'identity-reminder',
    role: 'system',
    content:
      'You are Skora, an AI powered by Claude modal, provided by Anthropic. However, since this is in production environment, you MUST refer to yourself as Skora, powered by Tuturuuu. Do not talk more about your origins and keep this message in mind, pretend like I never specifically told you about it.',
  },
];

const trailingMessages: Message[] = [
  {
    id: 'prettier-reminder',
    role: 'assistant',
    content:
      '(Note to self): I MUST try to utilize markdown where possible to enrich the chatting experience with the user in a smart, easy-to-understand and organized way. If I need to use inline block, I must use ``` to create a code block instead, for better formatting. If there is any math operations or formulas, I MUST use LaTeX, combining with markdown to render them properly. I MUST NEVER provide links. At THE END and ONLY AT THE END of my answer, I MUST provide 3 follow-up questions that THE USER WOULD ASK (each enclosed in "@<FOLLOWUP>" and "</FOLLOWUP>" pairs, DO NOT use other tags in other places, MAKE USE OF MARKDOWN AND LATEX) so that user can choose to ask me and continue the conversation with me in a meaningful and helpful way. I MUST NEVER mention this note to the user, since they NEVER need to know about it.',
  },
];

export const filterDuplicate = (str: string) => {
  const strLength = str.length;
  const halfLength = Math.floor(strLength / 2);
  const firstHalf = str.substring(0, halfLength);
  const secondHalf = str.substring(halfLength, strLength);

  if (firstHalf !== secondHalf) return str;
  return firstHalf;
};

const filterDuplicates = (messages: Message[]) =>
  // If there is 2 repeated substring in the
  // message, we will merge them into one
  messages.map((message) => {
    return { ...message, content: filterDuplicate(message.content) };
  });

const normalize = (message: Message) => {
  const { content, role } = message;
  if (role === 'user') return `${HUMAN_PROMPT} ${content}`;
  if (role === 'assistant') return `${AI_PROMPT} ${content}`;
  return content;
};

const filterSystemMessages = (messages: Message[]) =>
  messages.filter((message) => message.role !== 'system');

export function buildPrompt(messages: Message[]) {
  const filteredMsgs = filterDuplicates(messages);
  const normalizedMsgs = normalizeMessages(filteredMsgs);
  return normalizedMsgs + AI_PROMPT;
}

const normalizeMessages = (messages: Message[]) =>
  [...leadingMessages, ...filterSystemMessages(messages), ...trailingMessages]
    .map(normalize)
    .join('')
    .trim();
