/** Context sections that load only when the turn plausibly needs them. */
export type MiraOptionalContextSection =
  | 'tasks'
  | 'calendar'
  | 'finance'
  | 'memories';

export type MiraContextNeeds = Record<MiraOptionalContextSection, boolean>;

const ALL_CONTEXT: MiraContextNeeds = {
  tasks: true,
  calendar: true,
  finance: true,
  memories: true,
};
const NO_OPTIONAL_CONTEXT: MiraContextNeeds = {
  tasks: false,
  calendar: false,
  finance: false,
  memories: false,
};

const SOCIAL_PHRASES = [
  // English greetings, thanks, farewells and laughter
  'good morning',
  'good afternoon',
  'good evening',
  'good night',
  'thank you so much',
  'thank you',
  'thanks a lot',
  'many thanks',
  'see you later',
  'see you',
  'see ya',
  'got it',
  'hello',
  'hi',
  'hey',
  'heya',
  'hiya',
  'howdy',
  'yo',
  'gm',
  'gn',
  'thanks',
  'thx',
  'ty',
  'tysm',
  'cheers',
  'bye',
  'goodbye',
  'cya',
  'nice',
  'cool',
  'great',
  'awesome',
  'lol',
  'haha',
  'hehe',
  'hihi',
  // Vietnamese (diacritics removed before matching)
  'xin chao',
  'chao buoi sang',
  'chao buoi chieu',
  'chao buoi toi',
  'chuc ngu ngon',
  'cam on nhieu',
  'cam on',
  'tam biet',
  'chao',
  'alo',
];
const SOCIAL_ADDRESSEES = new Set([
  'mira',
  'there',
  'you',
  'all',
  'everyone',
  'buddy',
  'friend',
  'bro',
  'ban',
  'em',
  'anh',
  'chi',
  'cau',
  'nha',
  'nhe',
  'a',
  'nhieu',
  'lam',
]);
const MAX_SOCIAL_TURN_CHARS = 60;

// Patterns run against lowercase text with Vietnamese diacritics removed.
const RELATIVE_TIME_PATTERN =
  /\b(today|tonight|tomorrow|yesterday|this (morning|afternoon|evening)|week(end)?s?|months?|upcoming|later today|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december|in \d+ (hours?|days?|weeks?)|hom nay|ngay mai|hom qua|tuan|thang|sang nay|chieu nay|toi nay|cuoi tuan|thu (hai|ba|tu|nam|sau|bay)|chu nhat)\b|\b\d{1,2}[/-]\d{1,2}\b/;
const TASK_PATTERN =
  /\b(tasks?|to-?dos?|to do|deadlines?|due|overdue|priorit\w*|backlog|boards?|sprints?|projects?|assignments?|homework|chores?|errands?|checklists?|workload|plan|planning|remind\w*|focus|what should i|cong viec|viec|nhiem vu|han chot|ke hoach|du an|bai tap|can lam|nhac)\b/;
const CALENDAR_PATTERN =
  /\b(calendars?|schedul\w*|events?|meetings?|appointments?|agenda|busy|free|availab\w*|book\w*|calls?|standups?|lich|su kien|cuoc hop|hop|lich hen|hen|ranh)\b/;
const FINANCE_PATTERN =
  /[$€£¥₫]|\b(financ\w*|money|wallets?|balances?|budgets?|spen[dt]\w*|expenses?|income|salary|transactions?|payments?|pay|paid|costs?|bills?|invoices?|debts?|loans?|savings?|bank|cash|usd|vnd|invest\w*|tien|chi tieu|ngan sach|thu nhap|luong|giao dich|thanh toan|tiet kiem|vi tien)\b/;
// Workspace switches and broad check-ins can touch any domain.
const OVERVIEW_PATTERN =
  /\b(workspaces?|switch|my day|overview|summar\w*|recap|brief\w*|status|dashboard|everything|catch me up|what'?s (up|new|next|going on|happening)|anything (new|important|due)|tong quan|tom tat|khong gian)\b/;

function normalizeTurnText(message: string): string {
  return message
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
}

function isSocialTurn(text: string): boolean {
  if (text.length > MAX_SOCIAL_TURN_CHARS) return false;
  const words = text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return false;

  let index = 0;
  let matchedPhrase = false;
  while (index < words.length) {
    const phrase = SOCIAL_PHRASES.find((candidate) => {
      const parts = candidate.split(' ');
      return parts.every((part, offset) => words[index + offset] === part);
    });
    if (phrase) {
      matchedPhrase = true;
      index += phrase.split(' ').length;
      continue;
    }
    if (SOCIAL_ADDRESSEES.has(words[index]!)) {
      index += 1;
      continue;
    }
    return false;
  }
  return matchedPhrase;
}

/**
 * Local, model-free policy for which optional context a turn needs.
 *
 * Greetings, thanks and farewells load none of it. Every other turn loads
 * saved memories, and loads task, calendar and finance context when it names
 * that domain, a relative date, a workspace switch or a broad check-in.
 * Skipped sections stay reachable through Mira's tools.
 */
export function resolveMiraContextNeeds(
  latestUserMessage: string | null | undefined
): MiraContextNeeds {
  if (latestUserMessage == null) return ALL_CONTEXT;
  const text = normalizeTurnText(latestUserMessage);
  // An attachment-only turn gives no signal, so keep the full context.
  if (!text) return ALL_CONTEXT;
  if (isSocialTurn(text)) return NO_OPTIONAL_CONTEXT;

  if (OVERVIEW_PATTERN.test(text)) return ALL_CONTEXT;
  const relativeTime = RELATIVE_TIME_PATTERN.test(text);
  return {
    tasks: relativeTime || TASK_PATTERN.test(text),
    calendar: relativeTime || CALENDAR_PATTERN.test(text),
    finance: FINANCE_PATTERN.test(text),
    memories: true,
  };
}
