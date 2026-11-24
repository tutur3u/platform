/**
 * The language room Mira replies in. Quick actions send a prompt worded in
 * the requester's UI language, so the question alone does not say which
 * language the room speaks. The reply follows the language people's
 * messages use, then the question's language, then the requester's UI locale.
 */

export type MeetReplyLanguage = 'English' | 'Vietnamese';

const LOCALE_LANGUAGES: Record<string, MeetReplyLanguage> = {
  en: 'English',
  vi: 'Vietnamese',
};

/**
 * Letters only Vietnamese uses among Latin scripts. Marks other languages
 * share (é, à, â, ô, ã, õ and similar) are left out, so loanwords such as
 * "résumé" and French or Portuguese text don't read as Vietnamese.
 */
const VIETNAMESE = /[ăđơưảạằắẳẵặầấẩẫậẻẽẹềếểễệỉĩịỏọồốổỗộờớởỡợủũụừứửữựỳỷỹỵ]/iu;

/**
 * Words that mark English. Two different ones are needed, and short words
 * that also occur in Vietnamese typed without marks ("a", "to", "do", "so",
 * "on", "be", "it") are left out.
 */
const ENGLISH_WORDS = new Set([
  'about',
  'agreed',
  'and',
  'are',
  'can',
  'did',
  'everyone',
  'for',
  'good',
  'have',
  'hello',
  'is',
  'let',
  'meeting',
  'of',
  'our',
  'please',
  'sounds',
  'thanks',
  'that',
  'the',
  'this',
  'us',
  'was',
  'we',
  'what',
  'will',
  'with',
  'you',
]);

/**
 * Mentions that ask Mira. Same handles and following boundary as room chat
 * (`packages/realtime/src/meet/assistant-mentions.ts`); any preceding
 * non-letter counts here, which only leaves out more requests.
 */
const MIRA_MENTION =
  /(^|[^\p{L}\p{N}_-])@(?:tuturuuu|ttr|mira)(?![\p{L}\p{N}_-])/iu;

/** A message's language, when it is clearly English or Vietnamese. */
export function messageLanguage(text: string): MeetReplyLanguage | undefined {
  const body = text
    .replace(/@\S+/gu, ' ')
    .replace(/https?:\/\/\S+/gu, ' ')
    .trim();
  const words = body.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < 2) return undefined;
  const english = new Set(words.filter((word) => ENGLISH_WORDS.has(word)));
  const vietnamese = words.filter((word) => VIETNAMESE.test(word)).length;
  // An English sentence naming someone such as Đức stays English.
  if (vietnamese >= 2 || (vietnamese === 1 && english.size < 2))
    return 'Vietnamese';
  return english.size >= 2 ? 'English' : undefined;
}

/**
 * The language people in the chat write in: a 60% share of the messages
 * whose language is clear. Mira's own entries and requests to Mira don't
 * count: a reply in the wrong language can't carry the next one, and quick
 * actions are worded in the requester's UI language.
 */
export function conversationLanguage(
  history: ReadonlyArray<{ body: string; assistant?: boolean }>
) {
  const counts = new Map<MeetReplyLanguage, number>();
  let total = 0;
  for (const message of history.slice(-40)) {
    if (message.assistant || MIRA_MENTION.test(message.body)) continue;
    const language = messageLanguage(message.body);
    if (!language) continue;
    counts.set(language, (counts.get(language) ?? 0) + 1);
    total++;
  }
  for (const [language, count] of counts)
    if (count / total >= 0.6) return language;
  return undefined;
}

/** The reply language for a room question, or undefined to let the model match the question. */
export function meetReplyLanguage(
  history: ReadonlyArray<{ body: string; assistant?: boolean }>,
  question: string,
  locale?: string
): MeetReplyLanguage | undefined {
  return (
    conversationLanguage(history) ??
    messageLanguage(question) ??
    (locale ? LOCALE_LANGUAGES[locale.toLowerCase().split('-')[0]!] : undefined)
  );
}
