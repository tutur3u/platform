interface SafeErrorFields {
  name?: string;
  code?: string | number;
  status?: number;
}

function isLogToken(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !/[^\w.-]/u.test(value)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function safeErrorFields(error: unknown): SafeErrorFields {
  if (typeof error !== 'object' || error === null) return {};

  try {
    const name = 'name' in error ? error.name : undefined;
    const code = 'code' in error ? error.code : undefined;
    const status = 'status' in error ? error.status : undefined;
    const fields: SafeErrorFields = {};

    if (isLogToken(name, 60)) fields.name = name;
    if (
      isLogToken(code, 40) ||
      (isFiniteNumber(code) && isLogToken(String(code), 40))
    ) {
      fields.code = code;
    }
    if (isFiniteNumber(status)) fields.status = status;
    else if ('statusCode' in error) {
      const statusCode = error.statusCode;
      if (isFiniteNumber(statusCode)) fields.status = statusCode;
    }
    return fields;
  } catch {
    // Accessors on a thrown value can throw while inspecting it.
    return {};
  }
}

export function safeLogWorkspaceId(wsId: string): string | undefined {
  // Request paths can contain arbitrary text. Only log persisted ID shapes.
  const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu;
  return wsId.length === 36 && uuid.test(wsId) ? wsId : undefined;
}
