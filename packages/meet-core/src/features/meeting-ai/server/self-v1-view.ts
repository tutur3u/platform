/**
 * A room view without its outbox: `pending` names other accounts and their
 * legal entries, so it never reaches the browser.
 */
export function withoutPending<T extends object>(view: T) {
  const { pending: _pending, ...rest } = view as T & { pending?: unknown };
  return rest as Omit<T, 'pending'>;
}
