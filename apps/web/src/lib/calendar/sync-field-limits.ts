const WORKSPACE_CALENDAR_EVENT_LIMITS = {
  title: 255,
  description: 10000,
} as const;

const WORKSPACE_CALENDAR_EVENT_BYTE_LIMITS = {
  title: WORKSPACE_CALENDAR_EVENT_LIMITS.title * 4,
  description: WORKSPACE_CALENDAR_EVENT_LIMITS.description * 4,
} as const;

const textEncoder = new TextEncoder();

const ENCRYPTED_FIELD_OVERHEAD_BYTES = 28;

function getBase64EncodedLength(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}

function clampTextField(
  value: string | null | undefined,
  charLimit: number,
  byteLimit: number
): string | null | undefined {
  if (typeof value !== 'string') {
    return value;
  }

  if (
    value.length <= charLimit &&
    textEncoder.encode(value).length <= byteLimit
  ) {
    return value;
  }

  let low = 0;
  let high = Math.min(value.length, charLimit);
  let best = '';

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = value.slice(0, mid);

    if (textEncoder.encode(candidate).length <= byteLimit) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function clampTextByEncodedByteBudget(
  value: string | null | undefined,
  encodedByteLimit: number,
  encodeLength: (utf8ByteLength: number) => number
): string | null | undefined {
  if (typeof value !== 'string') {
    return value;
  }

  if (encodeLength(textEncoder.encode(value).length) <= encodedByteLimit) {
    return value;
  }

  let low = 0;
  let high = value.length;
  let best = '';

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = value.slice(0, mid);

    if (
      encodeLength(textEncoder.encode(candidate).length) <= encodedByteLimit
    ) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

export function sanitizeWorkspaceCalendarEventFields<
  T extends {
    title?: string | null;
    description?: string | null;
  },
>(event: T): T {
  return {
    ...event,
    title: clampTextField(
      event.title,
      WORKSPACE_CALENDAR_EVENT_LIMITS.title,
      WORKSPACE_CALENDAR_EVENT_BYTE_LIMITS.title
    ),
    description: clampTextField(
      event.description,
      WORKSPACE_CALENDAR_EVENT_LIMITS.description,
      WORKSPACE_CALENDAR_EVENT_BYTE_LIMITS.description
    ),
  };
}

export function clampWorkspaceCalendarPlaintextForEncryptedStorage<
  T extends {
    title?: string | null;
    description?: string | null;
  },
>(event: T): T {
  return {
    ...event,
    title: clampTextByEncodedByteBudget(
      event.title,
      WORKSPACE_CALENDAR_EVENT_LIMITS.title,
      (plaintextByteLength) =>
        getBase64EncodedLength(
          plaintextByteLength + ENCRYPTED_FIELD_OVERHEAD_BYTES
        )
    ),
    description: clampTextByEncodedByteBudget(
      event.description,
      WORKSPACE_CALENDAR_EVENT_LIMITS.description,
      (plaintextByteLength) =>
        getBase64EncodedLength(
          plaintextByteLength + ENCRYPTED_FIELD_OVERHEAD_BYTES
        )
    ),
  };
}

export {
  WORKSPACE_CALENDAR_EVENT_BYTE_LIMITS,
  WORKSPACE_CALENDAR_EVENT_LIMITS,
};
