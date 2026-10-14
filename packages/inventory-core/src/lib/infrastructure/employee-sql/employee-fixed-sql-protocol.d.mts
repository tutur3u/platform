import type { z } from 'zod';
export const CatalogSql: readonly string[];
export const Signatures: readonly string[];
export const Identity: z.ZodType<{
  actorUserId: string;
  userId: string;
  email: string;
  displayName: string;
}>;
export const Database: z.ZodType<{
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ca?: string;
}>;
export const Start: z.ZodType<{
  kind: 'start';
  session: string;
  phase: 'preflight' | 'finalize' | 'confirm';
  identity: z.infer<typeof Identity>;
  database: z.infer<typeof Database>;
}>;
export const Command: z.ZodType;
export const Message: z.ZodType<
  | {
      kind: 'catalog';
      session: string;
      checkpoint: 'before-effect' | 'before-commit';
      peerCertificateSha256: string;
      rows: Record<string, unknown>[][];
      result?: unknown;
    }
  | { kind: 'committing'; session: string }
  | { kind: 'committed'; session: string; result: unknown }
  | { kind: 'aborted'; session: string }
>;
export function parseBounded<T>(schema: z.ZodType<T>, input: unknown): T | null;
export function normalizeSql(value: string): string;

export function isWorkerCommitLive(input: {
  expiresAt: number;
  bornAt: number;
  now: number;
  monotonicNow: number;
}): boolean;
