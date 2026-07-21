export type MailSearchState =
  | 'archived'
  | 'draft'
  | 'read'
  | 'sent'
  | 'starred'
  | 'trash'
  | 'unread';

export type ParsedMailSearch = {
  after?: string;
  before?: string;
  freeText: string[];
  from: string[];
  hasAttachment: boolean;
  labels: string[];
  states: MailSearchState[];
  subject: string[];
  recipients: Array<{
    kind: 'bcc' | 'cc' | 'to';
    value: string;
  }>;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SEARCH_STATES = new Set<MailSearchState>([
  'archived',
  'draft',
  'read',
  'sent',
  'starred',
  'trash',
  'unread',
]);

type MailSearchToken = {
  operator?: string;
  value: string;
};

function isAsciiLetter(character: string | undefined) {
  if (!character) return false;
  const code = character.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isWhitespace(character: string | undefined) {
  return character !== undefined && character.trim() === '';
}

function readTokenValue(input: string, start: number) {
  if (input[start] === '"') {
    const valueStart = start + 1;
    const closingQuote = input.indexOf('"', valueStart);
    const end = closingQuote === -1 ? input.length : closingQuote;
    return {
      nextIndex: closingQuote === -1 ? input.length : closingQuote + 1,
      value: input.slice(valueStart, end),
    };
  }

  let end = start;
  while (end < input.length && !isWhitespace(input[end])) end += 1;
  return { nextIndex: end, value: input.slice(start, end) };
}

function tokenizeMailSearch(input: string): MailSearchToken[] {
  const tokens: MailSearchToken[] = [];
  let index = 0;

  while (index < input.length) {
    while (index < input.length && isWhitespace(input[index])) index += 1;
    if (index >= input.length) break;

    const tokenStart = index;
    while (index < input.length && isAsciiLetter(input[index])) index += 1;

    if (index > tokenStart && input[index] === ':') {
      const operator = input.slice(tokenStart, index).toLowerCase();
      const token = readTokenValue(input, index + 1);
      tokens.push({ operator, value: token.value });
      index = token.nextIndex;
      continue;
    }

    const token = readTokenValue(input, tokenStart);
    tokens.push({ value: token.value });
    index = token.nextIndex;
  }

  return tokens;
}

export function parseMailSearch(value: string | undefined): ParsedMailSearch {
  const parsed: ParsedMailSearch = {
    freeText: [],
    from: [],
    hasAttachment: false,
    labels: [],
    recipients: [],
    states: [],
    subject: [],
  };

  if (!value?.trim()) return parsed;

  for (const token of tokenizeMailSearch(value)) {
    const operator = token.operator;
    const operatorValue = operator ? token.value.trim() : '';
    const freeText = operator ? '' : token.value.trim();

    if (!operator) {
      if (freeText) parsed.freeText.push(freeText);
      continue;
    }

    if (!operatorValue) continue;
    if (operator === 'from') parsed.from.push(operatorValue);
    else if (operator === 'subject') parsed.subject.push(operatorValue);
    else if (operator === 'label') parsed.labels.push(operatorValue);
    else if (operator === 'to' || operator === 'cc' || operator === 'bcc') {
      parsed.recipients.push({ kind: operator, value: operatorValue });
    } else if (
      operator === 'is' &&
      SEARCH_STATES.has(operatorValue.toLowerCase() as MailSearchState)
    ) {
      parsed.states.push(operatorValue.toLowerCase() as MailSearchState);
    } else if (operator === 'has' && operatorValue === 'attachment') {
      parsed.hasAttachment = true;
    } else if (operator === 'before' && DATE_PATTERN.test(operatorValue)) {
      parsed.before = operatorValue;
    } else if (operator === 'after' && DATE_PATTERN.test(operatorValue)) {
      parsed.after = operatorValue;
    } else {
      parsed.freeText.push(`${operator}:${operatorValue}`);
    }
  }

  return parsed;
}

export function escapeMailLike(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}
