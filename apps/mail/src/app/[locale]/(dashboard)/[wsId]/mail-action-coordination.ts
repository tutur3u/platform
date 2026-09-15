import type { QueryClient } from '@tanstack/react-query';

const revisions = new WeakMap<QueryClient, Map<string, symbol>>();
const key = (workspaceId: string, mailboxId: string, threadId: string) =>
  JSON.stringify([workspaceId, mailboxId, threadId]);

/** A failed background read must never undo a newer archive or explicit unread. */
export function claimMailOptimisticRevision(
  client: QueryClient,
  workspaceId: string,
  mailboxId: string,
  ids: Set<string>
) {
  let current = revisions.get(client);
  if (!current) {
    current = new Map();
    revisions.set(client, current);
  }
  const revision = Symbol();
  for (const id of ids) current.set(key(workspaceId, mailboxId, id), revision);
  return revision;
}

export function currentMailOptimisticIds(
  client: QueryClient,
  workspaceId: string,
  mailboxId: string,
  ids: Set<string>,
  revision: symbol
) {
  const current = revisions.get(client);
  return new Set(
    [...ids].filter(
      (id) => current?.get(key(workspaceId, mailboxId, id)) === revision
    )
  );
}

/** Optimistic actions happen immediately; persist after any earlier automatic read. */
export function waitForMailBackgroundReads(
  client: QueryClient,
  workspaceId: string,
  mailboxId: string,
  ids: string[]
): Promise<void> {
  const cache = client.getMutationCache();
  const pending = () =>
    cache.findAll({
      mutationKey: ['mail', workspaceId, mailboxId, 'actions'],
      status: 'pending',
      predicate: (mutation) =>
        mutation.options.mutationKey?.at(-1) === 'folder-read' ||
        (mutation.options.mutationKey?.at(-1) === 'viewed-read' &&
          ids.includes(
            (mutation.state.variables as { threadId: string }).threadId
          )),
    }).length > 0;
  if (!pending()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = cache.subscribe(() => {
      if (pending()) return;
      unsubscribe();
      resolve();
    });
  });
}

const reconciliations = new WeakMap<
  QueryClient,
  Map<string, ReturnType<typeof setTimeout>>
>();

/** Refetch after mutation status settles, without holding the action controls busy. */
export function reconcileMailWhenIdle(
  client: QueryClient,
  workspaceId: string,
  mailboxId: string,
  reconcile: () => Promise<unknown>
) {
  let timers = reconciliations.get(client);
  if (!timers) {
    timers = new Map();
    reconciliations.set(client, timers);
  }
  const scope = key(workspaceId, mailboxId, '');
  clearTimeout(timers.get(scope));
  timers.set(
    scope,
    setTimeout(() => {
      timers.delete(scope);
      if (
        client.isMutating({
          mutationKey: ['mail', workspaceId, mailboxId, 'actions'],
        })
      )
        return;
      void reconcile();
    }, 0)
  );
}
