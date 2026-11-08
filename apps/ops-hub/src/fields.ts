import { z } from 'zod';

export const SECURITY =
  /sec-\d|vuln|idor|cve|rls|leak|breach|exploit|pii|auth(?:entication)? bypass|incident|security/i;
export const UNSAFE =
  /gh[pousr]_|github_pat_|\bsk-|\bxox|\bAKIA|\beyJ[A-Za-z0-9_-]+\.|-----BEGIN|\bBearer\b|https?:\/\/\S*(?:\?|\/hooks\/)|relay\.t3\.codes|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\s().-]*){9,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\bdpl_\w+|\b(?:\d{1,3}\.){3}\d{1,3}\b|(?:[0-9a-f]{0,4}:){2,}[0-9a-f:]+|~\/|\/(?:Users|home)\//i;
export function safe(value: string) {
  return SECURITY.test(value)
    ? 'Security issue'
    : UNSAFE.test(value)
      ? 'Withheld, open on Mac'
      : value;
}
export const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) =>
      [...value].every((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127)
    )
    .transform(safe);
export const id = z
  .string()
  .max(80)
  .regex(/^[a-z][a-z0-9-]*$/)
  .refine((value) => !UNSAFE.test(value));
export const timestamp = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
