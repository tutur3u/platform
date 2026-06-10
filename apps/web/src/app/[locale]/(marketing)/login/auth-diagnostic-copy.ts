export function appendDiagnosticReference({
  description,
  diagnosticCode,
  referenceLabel,
}: {
  description?: string | null;
  diagnosticCode?: string | null;
  referenceLabel: string;
}) {
  if (!diagnosticCode) {
    return description || undefined;
  }

  return description ? `${description} ${referenceLabel}` : referenceLabel;
}

export function createClientAuthDiagnosticCode(prefix: string) {
  const bytes = new Uint8Array(3);

  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    bytes.set(Array.from({ length: 3 }, () => Math.floor(Math.random() * 256)));
  }

  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  return `${prefix}-${suffix}`;
}
