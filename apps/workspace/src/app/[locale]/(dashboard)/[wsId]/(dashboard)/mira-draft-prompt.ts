/**
 * `?prompt=` on the workspace home (`/[locale]/[wsId]`) carries text into
 * Mira's composer as an unsent draft, for example from the command center's
 * Ask Mira action. The workspace is the route's own `[wsId]`; nothing else is
 * read from the URL. The draft is never sent automatically.
 */
export const MIRA_DRAFT_PROMPT_PARAM = 'prompt';
export const MIRA_DRAFT_PROMPT_MAX_LENGTH = 4000;

// C0 controls and DEL, except tab and line feed.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

/**
 * The draft text, or undefined when the parameter is missing, repeated,
 * empty after cleanup, or longer than the limit. Rejected input is dropped
 * whole, never truncated.
 */
export function parseMiraDraftPrompt(
  value: string | string[] | undefined
): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length > MIRA_DRAFT_PROMPT_MAX_LENGTH) return undefined;
  const text = value
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARACTERS, '')
    .trim();
  return text ? text : undefined;
}
