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

const TOKEN_PATTERN = /([a-z]+):(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+)/giu;
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

  for (const match of value.matchAll(TOKEN_PATTERN)) {
    const operator = match[1]?.toLowerCase();
    const operatorValue = (match[2] ?? match[3] ?? '').trim();
    const freeText = (match[4] ?? match[5] ?? '').trim();

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
