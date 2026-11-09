type FormValueMap = Record<string, unknown>;

const INTERNAL_FORM_KEYS = new Set([
  'submitting',
  'success',
  'error',
  'message',
]);

function humanizeKey(key: string): string {
  const withSpaces = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();

  if (!withSpaces) return key;
  return withSpaces[0]!.toUpperCase() + withSpaces.slice(1);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'N/A';
    return value.map((item) => formatValue(item)).join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return 'N/A';
    }
  }
  return String(value);
}

function toRecord(value: unknown): FormValueMap {
  return value && typeof value === 'object'
    ? (value as FormValueMap)
    : ({} as FormValueMap);
}

function normalizeActionPrompt(actionId: string, label: string): string {
  const trimmedId = actionId.trim();
  const trimmedLabel = label.trim();

  const looksNaturalPrompt =
    /[?!.]$/.test(trimmedId) || /\s/.test(trimmedId) || trimmedId.length > 32;

  if (looksNaturalPrompt && trimmedId) return trimmedId;
  if (trimmedLabel) return trimmedLabel;
  if (trimmedId) return humanizeKey(trimmedId);
  return 'Continue';
}

export function buildFormSubmissionMessage(params: {
  title?: unknown;
  values?: unknown;
}): string {
  const title =
    typeof params.title === 'string' && params.title.trim().length > 0
      ? params.title.trim()
      : 'Form Submission';

  const values = toRecord(params.values);
  const entries = Object.entries(values).filter(
    ([key]) => !INTERNAL_FORM_KEYS.has(key) && !key.startsWith('__')
  );

  const formattedValues =
    entries.length > 0
      ? entries
          .map(
            ([key, value]) => `**${humanizeKey(key)}**: ${formatValue(value)}`
          )
          .join('\n')
      : '**Details**: Submitted via generated form';

  return `### ${title}\n\n${formattedValues}`;
}

export function buildUiActionSubmissionMessage(params: {
  id?: unknown;
  label?: unknown;
  source?: unknown;
}): string {
  const actionId = typeof params.id === 'string' ? params.id : '';
  const label = typeof params.label === 'string' ? params.label : '';
  const source =
    typeof params.source === 'string' && params.source.trim().length > 0
      ? params.source.trim()
      : 'ui';
  const actionPrompt = normalizeActionPrompt(actionId, label);

  return `### UI Action\n\n**Action**: ${actionPrompt}\n**Source**: ${source}`;
}
