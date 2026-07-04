import { z } from 'zod';

export const sepayRawPayloadSchema = z.looseObject({});

export const normalizedSepayPayloadSchema = z.object({
  accountNumber: z.string().nullable(),
  bankAccountId: z.string().nullable(),
  code: z.string().nullable(),
  content: z.string().nullable(),
  description: z.string().nullable(),
  eventId: z.string().nullable(),
  gateway: z.string().nullable(),
  raw: z.record(z.string(), z.unknown()),
  referenceCode: z.string().nullable(),
  subAccountId: z.string().nullable(),
  transactionDate: z.iso.datetime(),
  transferAmount: z.number().nonnegative(),
  transferType: z.enum(['in', 'out']),
});

export type NormalizedSepayPayload = z.infer<
  typeof normalizedSepayPayloadSchema
>;

function getStringFromUnknown(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  return null;
}

function getNestedValue(
  source: Record<string, unknown>,
  path: readonly string[]
): unknown {
  let current: unknown = source;

  for (const segment of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function firstPresentString(
  source: Record<string, unknown>,
  paths: ReadonlyArray<readonly string[]>
): string | null {
  for (const path of paths) {
    const value = getStringFromUnknown(getNestedValue(source, path));
    if (value) {
      return value;
    }
  }

  return null;
}

function parseTransferType(value: string | null): 'in' | 'out' | null {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (normalized === 'in' || normalized === 'income') {
    return 'in';
  }

  if (
    normalized === 'out' ||
    normalized === 'expense' ||
    normalized === 'outcome'
  ) {
    return 'out';
  }

  return null;
}

function parseAmount(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.replaceAll(',', '').trim();
  if (!normalized) {
    return null;
  }

  if (/^-?\d+$/.test(normalized)) {
    const asBigInt = BigInt(normalized);
    const absolute = asBigInt < 0n ? -asBigInt : asBigInt;
    if (absolute > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }

    return Number(absolute);
  }

  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    const unsigned = normalized.startsWith('-')
      ? normalized.slice(1)
      : normalized;
    const integerPart = unsigned.split('.')[0] ?? unsigned;
    const integerMagnitude = BigInt(integerPart);
    const fractionalPart = unsigned.split('.')[1] ?? '';

    if (
      integerMagnitude > BigInt(Number.MAX_SAFE_INTEGER) ||
      (integerMagnitude === BigInt(Number.MAX_SAFE_INTEGER) &&
        /[1-9]/.test(fractionalPart))
    ) {
      return null;
    }

    const parsed = Number(unsigned);

    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed;
  }

  return null;
}

const SEPAY_ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const SEPAY_LEGACY_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/;

function parseDateToIso(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (/^\d+$/.test(value)) {
    const epoch = Number(value);
    if (Number.isFinite(epoch)) {
      const asMs = value.length <= 10 ? epoch * 1000 : epoch;
      const epochDate = new Date(asMs);

      if (!Number.isNaN(epochDate.getTime())) {
        return epochDate.toISOString();
      }
    }
  }

  const normalized = value.trim();
  let candidate: string | null = null;

  if (SEPAY_ISO_DATETIME_PATTERN.test(normalized)) {
    candidate = normalized;
  } else if (SEPAY_LEGACY_DATETIME_PATTERN.test(normalized)) {
    candidate = `${normalized.replace(' ', 'T')}+07:00`;
  } else {
    return null;
  }

  const parsedDate = new Date(candidate);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
}

export function normalizeSepayPayload(raw: Record<string, unknown>) {
  const transferType = parseTransferType(
    firstPresentString(raw, [
      ['transferType'],
      ['transfer_type'],
      ['direction'],
    ])
  );

  const transferAmount = parseAmount(
    firstPresentString(raw, [
      ['transferAmount'],
      ['transfer_amount'],
      ['amount'],
    ])
  );

  const transactionDate = parseDateToIso(
    firstPresentString(raw, [
      ['transactionDate'],
      ['transaction_date'],
      ['createdAt'],
      ['created_at'],
    ])
  );

  return normalizedSepayPayloadSchema.safeParse({
    accountNumber: firstPresentString(raw, [
      ['accountNumber'],
      ['account_number'],
      ['bankAccount', 'accountNumber'],
      ['bankAccount', 'account_number'],
    ]),
    bankAccountId: firstPresentString(raw, [
      ['bankAccountId'],
      ['bank_account_id'],
      ['bankAccount', 'id'],
      ['accountId'],
      ['account_id'],
    ]),
    code: firstPresentString(raw, [['code']]),
    content: firstPresentString(raw, [['content']]),
    description: firstPresentString(raw, [['description']]),
    eventId: firstPresentString(raw, [['id'], ['eventId'], ['event_id']]),
    gateway: firstPresentString(raw, [['gateway']]),
    raw,
    referenceCode: firstPresentString(raw, [
      ['referenceCode'],
      ['reference_code'],
      ['reference'],
    ]),
    subAccountId: firstPresentString(raw, [
      ['subAccountId'],
      ['sub_account_id'],
      ['bankAccount', 'subAccountId'],
      ['bankAccount', 'sub_account_id'],
    ]),
    transactionDate,
    transferAmount,
    transferType,
  });
}
