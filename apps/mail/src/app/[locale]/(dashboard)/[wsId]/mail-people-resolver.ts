'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type ResolvedWorkspacePerson,
  resolveWorkspacePeople,
} from '@tuturuuu/internal-api/people';

const MAX_BATCH = 50;

type Pending = {
  resolve: (person: ResolvedWorkspacePerson) => void;
  reject: (error: unknown) => void;
};

type Resolve = typeof resolveWorkspacePeople;

/**
 * Coalesces per-address lookups made in the same tick into one request per
 * workspace (at most 50 addresses each), so a page of thread rows costs one
 * round trip instead of one per sender.
 */
export function createPeopleBatcher(resolve: Resolve = resolveWorkspacePeople) {
  const queues = new Map<string, Map<string, Pending[]>>();

  async function flush(workspaceId: string) {
    const queue = queues.get(workspaceId);
    queues.delete(workspaceId);
    if (!queue) return;
    const emails = [...queue.keys()];
    for (let start = 0; start < emails.length; start += MAX_BATCH) {
      const chunk = emails.slice(start, start + MAX_BATCH);
      try {
        const { data } = await resolve(workspaceId, chunk);
        const byEmail = new Map(data.map((person) => [person.email, person]));
        for (const email of chunk) {
          const person = byEmail.get(email) ?? {
            email,
            kind: 'unknown' as const,
            displayName: null,
            avatarUrl: null,
          };
          for (const waiter of queue.get(email) ?? []) waiter.resolve(person);
        }
      } catch (error) {
        for (const email of chunk) {
          for (const waiter of queue.get(email) ?? []) waiter.reject(error);
        }
      }
    }
  }

  return function lookup(workspaceId: string, address: string) {
    const email = address.trim().toLowerCase();
    return new Promise<ResolvedWorkspacePerson>((resolve, reject) => {
      let queue = queues.get(workspaceId);
      if (!queue) {
        queue = new Map();
        queues.set(workspaceId, queue);
        setTimeout(() => void flush(workspaceId), 0);
      }
      const waiters = queue.get(email) ?? [];
      waiters.push({ resolve, reject });
      queue.set(email, waiters);
    });
  };
}

const lookupPerson = createPeopleBatcher();

export function mailPersonQueryKey(workspaceId: string, address: string) {
  return ['mail', workspaceId, 'person', address.trim().toLowerCase()] as const;
}

/** Same-workspace member or contact for an address, or `unknown`. */
export function useMailPerson(
  workspaceId: string | undefined,
  address: string | null | undefined
) {
  const email = address?.trim().toLowerCase() ?? '';
  return useQuery({
    queryKey: mailPersonQueryKey(workspaceId ?? '', email),
    queryFn: () => lookupPerson(workspaceId!, email),
    enabled: Boolean(workspaceId && email.includes('@')),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });
}
