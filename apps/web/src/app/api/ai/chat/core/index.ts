import { AI_PROMPT, HUMAN_PROMPT } from '@anthropic-ai/sdk';
import { Message } from 'ai';

export const leadingMessages: Message[] = [
  {
    id: 'identity-reminder',
    role: 'system',
    content: `
You are Skora, an AI by Tuturuuu, customized and engineered by Võ Hoàng Phúc - The Founder of Tuturuuu.

Here is a set of guidelines you MUST follow:

- Utilize markdown formatting (WITHOUT HTML, as it is NOT SUPPORTED) and turn your response into an essay, or even better, a blog post where possible to enrich the chatting experience with the user in a smart, easy-to-understand, and organized way.
- If there are any math operations or formulas, you MUST use LaTeX, in combination with Markdown, to render them properly.
- At THE END and ONLY at THE END of your answer, you MUST provide 3 helpful follow-up prompts that predict WHAT THE USER MIGHT ASK, note that the question MUST be asked from the user perspective (each enclosed in "@<FOLLOWUP>" and "</FOLLOWUP>" pairs and NO USAGE of Markdown or LaTeX in this section, e.g. \n\n@<FOLLOWUP>Can you elaborate on the first topic?</FOLLOWUP>\n\n@<FOLLOWUP>Can you provide an alternative solution?</FOLLOWUP>\n\n@<FOLLOWUP>How would the approach that you suggested be more suitable for my use case?</FOLLOWUP>) so that user can choose to ask you and continue the conversation with you in a meaningful and helpful way. Outside of this section, ALWAYS use Markdown and LaTeX to enrich the chatting experience with the user.
`.trim(),
  },
];

export const trailingMessages: Message[] = [];

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

const normalizeAnthropic = (message: Message) => {
  const { content, role } = message;
  if (role === 'user') return `${HUMAN_PROMPT} ${content}`;
  if (role === 'assistant') return `${AI_PROMPT} ${content}`;
  return content;
};

const filterSystemMessages = (messages: Message[]) =>
  messages.filter((message) => message.role !== 'system');

const normalizeAnthropicMessages = (messages: Message[]) =>
  [...leadingMessages, ...filterSystemMessages(messages), ...trailingMessages]
    .map(normalizeAnthropic)
    .join('')
    .trim();

export function buildAnthropicPrompt(messages: Message[]) {
  const filteredMsgs = filterDuplicates(messages);
  const normalizedMsgs = normalizeAnthropicMessages(filteredMsgs);
  return normalizedMsgs + AI_PROMPT;
}

const normalizeGoogle = (message: Message) => ({
  role: message.role === 'user' ? 'user' : 'model',
  parts: [{ text: message.content }],
});

const normalizeGoogleMessages = (messages: Message[]) =>
  messages
    .filter(
      (message) => message.role === 'user' || message.role === 'assistant'
    )
    .map(normalizeGoogle);

export function buildGooglePrompt(messages: Message[]) {
  const normalizedMsgs = normalizeGoogleMessages(messages);
  return { contents: normalizedMsgs };
}

export function buildPrompt(
  messages: Message[],
  provider: 'anthropic' | 'google'
) {
  if (provider === 'anthropic') return buildAnthropicPrompt(messages);
  return buildGooglePrompt(messages);
}
