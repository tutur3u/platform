import { z } from 'zod';

/**
 * Mastermind Inbox ask-v2 reader (X1).
 *
 * One hub snapshot ask row in, one normalized card out. The Dart mirror is
 * `apps/mobile/lib/features/mastermind/asks/ask_card.dart`; both read
 * `fixtures/ask-v2.fixture.json` to `fixtures/ask-v2.normalized.json`.
 *
 * Reader rules (identical on both sides):
 * - unknown keys are ignored; an unknown enum or malformed optional field is
 *   absent, never fatal (except `risk_class`: present but unrecognised reads
 *   as `unknown`, which is risky, never as no risk). Only a bad `id` /
 *   `version_hash` rejects the row;
 * - `options_v2` / `recommended_id` win when `options_v2` is valid, otherwise
 *   `options` / `recommended_option` (a label) are used;
 * - `inbox_class` is derived when absent (see `deriveInboxClass`);
 * - a card is INCOMPLETE when its question text or options are missing.
 */

export const ASK_INBOX_CLASSES = ['urgent', 'decision', 'fyi'] as const;
export const ASK_RISK_CLASSES = [
  'deploy',
  'spend',
  'credential',
  'security',
  'normal',
] as const;
/**
 * What a card reports as `risk_class`: the published classes plus `unknown`,
 * which is never published. A PRESENT but unrecognised `risk_class` (an
 * unknown string, a number, an object) reads as `unknown`, which is risky, so
 * the gate fails closed. An absent (or null) `risk_class` stays null (old hub
 * data that never sent it).
 */
export const ASK_CARD_RISK_CLASSES = [...ASK_RISK_CLASSES, 'unknown'] as const;
export const ASK_INBOX_URGENCIES = [
  'now',
  'today',
  'soon',
  'whenever',
] as const;
export const ASK_RESOLVED_VIA = ['mobile', 'discord', 'mac', 'agent'] as const;
export const ASK_KINDS = ['decision', 'action', 'fyi'] as const;
export const ASK_PHASES = ['open', 'answered', 'withdrawn', 'expired'] as const;
export const ASK_INCOMPLETE_REASONS = [
  'missing_question',
  'missing_text',
  'truncated',
  'text_incomplete',
  'missing_options',
] as const;

export type AskInboxClass = (typeof ASK_INBOX_CLASSES)[number];
export type AskRiskClass = (typeof ASK_CARD_RISK_CLASSES)[number];
export type AskInboxUrgency = (typeof ASK_INBOX_URGENCIES)[number];
export type AskIncompleteReason = (typeof ASK_INCOMPLETE_REASONS)[number];

// Limits mirror the existing Dart `AskDetail` reader (looser than the
// publisher schema, which stays the gate for what the hub may send).
const MAX_TEXT = 20000;
const MAX_LABEL = 200;
const MAX_OPTIONS = 8;
const MAX_WHY = 280;
const MAX_NOTE = 200;
const MAX_OPTION_ID = 64;

const runeLength = (value: string) => [...value].length;

const text = (max: number) =>
  z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0 && runeLength(value) <= max)
    .optional()
    .catch(undefined);

const oneOf = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).optional().catch(undefined);

const riskClass = z
  .unknown()
  .transform((value): AskRiskClass | undefined => {
    if (value === undefined || value === null) return undefined;
    return (ASK_RISK_CLASSES as readonly unknown[]).includes(value)
      ? (value as AskRiskClass)
      : 'unknown';
  })
  .optional()
  .catch(undefined);

const isLeap = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const daysInMonth = (year: number, month: number) =>
  month === 2
    ? isLeap(year)
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31;

const TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Epoch seconds of a timezone-aware ISO timestamp, or undefined. Naive,
 * date-only and out-of-range values are invalid; fractions are dropped. Done
 * by hand so TS and Dart agree on every input.
 */
export function parseAskTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = TIMESTAMP.exec(value);
  if (!match) return undefined;
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number) as [number, number, number, number, number, number];
  if (
    year < 1970 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return undefined;
  }
  let offset = 0;
  const zone = match[7] as string;
  if (zone !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return undefined;
    offset = (offsetHour * 60 + offsetMinute) * 60 * (zone[0] === '-' ? -1 : 1);
  }
  const seconds =
    Date.UTC(year, month - 1, day, hour, minute, second) / 1000 - offset;
  return new Date(seconds * 1000).getUTCFullYear() > 9999 ? undefined : seconds;
}

/** `YYYY-MM-DDTHH:MM:SSZ` for epoch seconds. */
export const formatAskTimestamp = (seconds: number) =>
  `${new Date(seconds * 1000).toISOString().slice(0, 19)}Z`;

const timestamp = z
  .unknown()
  .transform(parseAskTimestamp)
  .optional()
  .catch(undefined);

export interface AskOption {
  id: string;
  label: string;
  note: string | null;
}

const optionText = (value: unknown, max: number) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && runeLength(trimmed) <= max ? trimmed : undefined;
};

/** All-or-nothing: one bad entry makes the list unusable (never trimmed). */
function parseOptionsV2(value: unknown): AskOption[] {
  if (!Array.isArray(value) || value.length > MAX_OPTIONS) return [];
  const options: AskOption[] = [];
  for (const row of value) {
    if (typeof row !== 'object' || row === null || Array.isArray(row))
      return [];
    const record = row as Record<string, unknown>;
    const id = optionText(record.id, MAX_OPTION_ID);
    const label = optionText(record.label, MAX_LABEL);
    if (id === undefined || label === undefined) return [];
    if (options.some((option) => option.id === id)) return [];
    options.push({
      id,
      label,
      note: optionText(record.note, MAX_NOTE) ?? null,
    });
  }
  return options;
}

/** Legacy string options get positional ids (`opt-0`, `opt-1`, ...). */
function parseLegacyOptions(value: unknown): AskOption[] {
  if (!Array.isArray(value) || value.length > MAX_OPTIONS) return [];
  const options: AskOption[] = [];
  for (const row of value) {
    const label = optionText(row, MAX_LABEL);
    if (label === undefined) return [];
    options.push({ id: `opt-${options.length}`, label, note: null });
  }
  return options;
}

const askInputSchema = z.object({
  id: z.string().regex(/^item-[a-f0-9]{20}$/),
  version_hash: z.string().regex(/^[a-f0-9]{64}$/),
  title: text(MAX_LABEL),
  body: text(MAX_TEXT),
  ask_text: text(MAX_TEXT),
  ask_truncated: z.boolean().optional().catch(undefined),
  text_complete: z.boolean().optional().catch(undefined),
  options: z.unknown().transform(parseLegacyOptions).catch([]),
  options_v2: z.unknown().transform(parseOptionsV2).catch([]),
  recommended_option: text(MAX_LABEL),
  recommended_id: text(MAX_OPTION_ID),
  recommended_why: text(MAX_WHY),
  kind: oneOf(ASK_KINDS),
  state: oneOf(['open', 'answered', 'withdrawn']),
  status: oneOf(['open', 'resolved', 'expired']),
  urgency: oneOf(ASK_INBOX_URGENCIES),
  inbox_class: oneOf(ASK_INBOX_CLASSES),
  risk_class: riskClass,
  resolved_via: oneOf(ASK_RESOLVED_VIA),
  deadline_at: timestamp,
  updated_at: timestamp,
});

type AskInput = z.infer<typeof askInputSchema>;

/** The normalized card both platforms render from. */
export const askCardSchema = z.object({
  id: z.string(),
  version_hash: z.string(),
  title: z.string().nullable(),
  text: z.string().nullable(),
  options: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      note: z.string().nullable(),
    })
  ),
  recommended_id: z.string().nullable(),
  recommended_label: z.string().nullable(),
  recommended_why: z.string().nullable(),
  inbox_class: z.enum(ASK_INBOX_CLASSES),
  urgency: z.enum(ASK_INBOX_URGENCIES).nullable(),
  deadline_at: z.string().nullable(),
  risk_class: z.enum(ASK_CARD_RISK_CLASSES).nullable(),
  risky: z.boolean(),
  phase: z.enum(ASK_PHASES),
  kind: z.enum(ASK_KINDS).nullable(),
  incomplete: z.boolean(),
  incomplete_reasons: z.array(z.enum(ASK_INCOMPLETE_REASONS)),
  updated_at: z.string().nullable(),
  resolved_via: z.enum(ASK_RESOLVED_VIA).nullable(),
});

export type AskCard = z.infer<typeof askCardSchema>;

const phaseOf = (input: AskInput): AskCard['phase'] => {
  if (input.status === 'expired') return 'expired';
  if (input.state === 'answered' || input.status === 'resolved') {
    return 'answered';
  }
  return input.state === 'withdrawn' ? 'withdrawn' : 'open';
};

/**
 * Explicit `inbox_class` wins. Otherwise: an open ask past its `deadline_at`
 * is urgent; then urgency maps now -> urgent, today|soon -> decision,
 * whenever -> fyi; with no urgency, a `fyi` kind is fyi and the rest are
 * decisions.
 */
export function deriveInboxClass(
  input: Pick<AskInput, 'inbox_class' | 'urgency' | 'kind' | 'deadline_at'>,
  phase: AskCard['phase'],
  nowSeconds: number
): AskInboxClass {
  if (input.inbox_class) return input.inbox_class;
  if (
    phase === 'open' &&
    input.deadline_at !== undefined &&
    input.deadline_at < nowSeconds
  ) {
    return 'urgent';
  }
  switch (input.urgency) {
    case 'now':
      return 'urgent';
    case 'today':
    case 'soon':
      return 'decision';
    case 'whenever':
      return 'fyi';
    default:
      return input.kind === 'fyi' ? 'fyi' : 'decision';
  }
}

function normalizeAsk(input: AskInput, nowSeconds: number): AskCard {
  const phase = phaseOf(input);
  const fromV2 = input.options_v2.length > 0;
  const options = fromV2 ? input.options_v2 : input.options;
  const recommended =
    (fromV2 && input.recommended_id !== undefined
      ? options.find((option) => option.id === input.recommended_id)
      : undefined) ??
    (input.recommended_option !== undefined
      ? options.find((option) => option.label === input.recommended_option)
      : undefined);
  const inboxClass = deriveInboxClass(input, phase, nowSeconds);
  const body = input.ask_text ?? input.body;

  const reasons: AskIncompleteReason[] = [];
  if (input.title === undefined) reasons.push('missing_question');
  if (body === undefined) reasons.push('missing_text');
  if (input.ask_truncated === true) reasons.push('truncated');
  if (input.text_complete === false) reasons.push('text_incomplete');
  if (options.length === 0 && inboxClass !== 'fyi' && input.kind !== 'fyi') {
    reasons.push('missing_options');
  }

  const risk = input.risk_class ?? null;
  return {
    id: input.id,
    version_hash: input.version_hash,
    title: input.title ?? null,
    text: body ?? null,
    options,
    recommended_id: recommended?.id ?? null,
    recommended_label: recommended?.label ?? null,
    recommended_why: recommended ? (input.recommended_why ?? null) : null,
    inbox_class: inboxClass,
    urgency: input.urgency ?? null,
    deadline_at:
      input.deadline_at === undefined
        ? null
        : formatAskTimestamp(input.deadline_at),
    risk_class: risk,
    risky: risk !== null && risk !== 'normal',
    phase,
    kind: input.kind ?? null,
    incomplete: reasons.length > 0,
    incomplete_reasons: reasons,
    updated_at:
      input.updated_at === undefined
        ? null
        : formatAskTimestamp(input.updated_at),
    resolved_via: input.resolved_via ?? null,
  };
}

/**
 * Parse one ask row. Returns null only for a malformed identity. `now` is
 * injected so derivation is deterministic in tests.
 */
export function parseAskCard(
  json: unknown,
  now: Date = new Date()
): AskCard | null {
  const parsed = askInputSchema.safeParse(json);
  if (!parsed.success) return null;
  return normalizeAsk(parsed.data, Math.floor(now.getTime() / 1000));
}
