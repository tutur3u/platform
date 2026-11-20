export function parseSplitAmount(input: string, minorDigits: number): number {
  const match = /^([0-9]+)(?:[.,]([0-9]+))?$/.exec(input.trim());
  if (!match || (match[2]?.length ?? 0) > minorDigits) return NaN;
  const minor = Number(match[1] + (match[2] ?? '').padEnd(minorDigits, '0'));
  return Number.isSafeInteger(minor) ? minor : NaN;
}
