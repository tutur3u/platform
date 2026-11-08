import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const tokenSchema = z.string().regex(/^(?:[0-9a-f]{2}){32,256}$/);
const activeTokens = z
  .union([tokenSchema, z.array(tokenSchema).min(1).max(2)])
  .transform((value) => (typeof value === 'string' ? [value] : value));
const tokensSchema = z
  .record(z.string().min(1), activeTokens)
  .refine((sites) => {
    const values = Object.values(sites).flat();
    return new Set(values).size === values.length;
  });

export function authorizePurge({
  header,
  siteId,
  tokensJson,
}: {
  header: string | null;
  siteId: string;
  tokensJson: string | undefined;
}): boolean {
  if ((header?.length ?? 0) > 600) return false;
  let secrets: string[];
  try {
    const sites = tokensSchema.parse(JSON.parse(tokensJson ?? '{}'));
    secrets = Object.hasOwn(sites, siteId) ? (sites[siteId] ?? []) : [];
  } catch {
    return false;
  }
  if (!secrets.length) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const supplied = digest(header ?? '');
  let matched = 0;
  for (const secret of secrets)
    matched |= Number(timingSafeEqual(supplied, digest(`Bearer ${secret}`)));
  return matched !== 0;
}
