export interface TextReplacementRule {
  trigger: string;
  replacement: string;
}

export const TEXT_REPLACEMENT_RULES: TextReplacementRule[] = [
  { trigger: '<--->', replacement: '⟷' },
  { trigger: '<-->', replacement: '⟷' },
  { trigger: '--->', replacement: '⟶' },
  { trigger: '-->', replacement: '⟶' },
  { trigger: '<->', replacement: '↔' },
  { trigger: '->', replacement: '→' },
  { trigger: '<---', replacement: '⟵' },
  { trigger: '<--', replacement: '⟵' },
  { trigger: '<-', replacement: '←' },
  { trigger: '=>', replacement: '⇒' },
  { trigger: '>=', replacement: '≥' },
  { trigger: '<=', replacement: '≤' },
  { trigger: '!=', replacement: '≠' },
  { trigger: '+-', replacement: '±' },
  { trigger: '...', replacement: '…' },
  { trigger: '(tm)', replacement: '™' },
  { trigger: '(c)', replacement: '©' },
  { trigger: '(r)', replacement: '®' },
  { trigger: '--', replacement: '–' },
];

const EXTENDABLE_TRIGGERS = TEXT_REPLACEMENT_RULES.filter((rule) =>
  TEXT_REPLACEMENT_RULES.some(
    (candidate) =>
      candidate.trigger !== rule.trigger &&
      candidate.trigger.startsWith(rule.trigger)
  )
)
  .map((rule) => rule.trigger)
  .sort((left, right) => right.length - left.length);

export function normalizeTextReplacements(value: string) {
  return TEXT_REPLACEMENT_RULES.reduce(
    (normalizedValue, rule) =>
      normalizedValue.replaceAll(rule.trigger, rule.replacement),
    value
  );
}

export function normalizeLiveTextReplacements(value: string) {
  const trailingTrigger = EXTENDABLE_TRIGGERS.find((trigger) =>
    value.endsWith(trigger)
  );

  if (!trailingTrigger) {
    return normalizeTextReplacements(value);
  }

  const committedValue = value.slice(0, -trailingTrigger.length);
  return `${normalizeTextReplacements(committedValue)}${trailingTrigger}`;
}

export function getNormalizedCursorPosition(
  value: string,
  cursorPosition: number,
  normalize = normalizeTextReplacements
) {
  return normalize(value.slice(0, cursorPosition)).length;
}
