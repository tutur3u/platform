import { AsyncLocalStorage } from 'node:async_hooks';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

const scope = new AsyncLocalStorage<AbortSignal>();
export const CRON_BUDGET_MS = 210_000;
export const MAX_SYNC_WORKSPACES = 10;
export const MAX_SYNC_CONNECTIONS = 20;

export function withProviderSyncBudget<T>(
  signal: AbortSignal,
  run: () => Promise<T>
): Promise<T> {
  return scope.run(signal, run);
}

export function providerSyncSignal() {
  return scope.getStore();
}

export function checkProviderSyncBudget() {
  providerSyncSignal()?.throwIfAborted();
}

export const providerSyncFetch: typeof fetch = (input, init) => {
  const signals = [AbortSignal.timeout(10_000)];
  const budget = providerSyncSignal();
  if (budget) signals.push(budget);
  if (input instanceof Request) signals.push(input.signal);
  if (init?.signal) signals.push(init.signal);
  const signal = AbortSignal.any(signals);
  signal.throwIfAborted();
  return fetch(input, { ...init, signal });
};

export async function createSyncAdminClient(): Promise<TypedSupabaseClient> {
  return providerSyncSignal()
    ? await createAdminClient({ noCookie: true, fetch: providerSyncFetch })
    : await createAdminClient();
}

// Completion writes retain a short independent budget after provider cancellation.
export async function createSyncCompletionClient(): Promise<TypedSupabaseClient> {
  return await createAdminClient({
    noCookie: true,
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(5_000) }),
  });
}

export function rotatingSyncBatch<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  const start = (Math.floor(Date.now() / 900_000) * limit) % items.length;
  return [...items.slice(start), ...items.slice(0, start)].slice(0, limit);
}
