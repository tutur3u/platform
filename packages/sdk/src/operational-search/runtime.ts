import { fail } from '../cli/operational-schema';
import { vectorSchema } from './cache';

export type EmbeddingRuntime = {
  fingerprint: string;
  embed: (
    text: string,
    kind: 'query' | 'document',
    title?: string
  ) => Promise<number[]>;
};

export function normalizeVector(input: unknown) {
  const values = vectorSchema.parse(input);
  const length = Math.hypot(...values);
  if (!Number.isFinite(length) || length === 0)
    fail('INVALID_EMBEDDING', 'embedding must have a finite nonzero norm');
  return values.map((value) => value / length);
}
