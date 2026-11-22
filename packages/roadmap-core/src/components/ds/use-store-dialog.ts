import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { useCallback } from 'react';
import {
  type StoreSelection,
  type StoreTab,
  storeSelection,
  withStoreSelection,
} from '../../content/store-releases';

/** History-state flag on an entry the page pushed by opening a store. */
const OPENER = 'roadmapStoreOpener';

function openedHere(state: unknown) {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>)[OPENER] === true
  );
}

/**
 * The store dialog's state lives in the URL (`?store=ios&tab=screenshots`),
 * so a link opens it and Back closes it. Opening pushes an entry marked in
 * its history state, a tab replaces it and keeps the mark, and closing a
 * marked entry goes back to the one it opened from, which also holds after
 * Forward or a reload. A dialog the reader landed on drops the two params in
 * place and shows the Releases tab when the link named no other section.
 */
export function useStoreDialog(ids: readonly string[]) {
  const search = useRouterState({
    select: (state) => state.location.search as Record<string, unknown>,
  });
  const opened = useRouterState({
    select: (state) => openedHere(state.location.state),
  });
  const selection = storeSelection(search, ids);
  const navigate = useNavigate();
  const router = useRouter();

  const go = useCallback(
    (
      next: StoreSelection | null,
      options: {
        replace: boolean;
        state: true | Record<string, unknown>;
        hash?: true | ((hash: string) => string);
      }
    ) =>
      navigate({
        to: '.',
        search: (previous: Record<string, unknown>) =>
          withStoreSelection(previous, next),
        hash: options.hash ?? true,
        state: options.state,
        replace: options.replace,
        resetScroll: false,
        hashScrollIntoView: false,
      } as never),
    [navigate]
  );

  const open = useCallback(
    (store: string) =>
      void go(
        { store, tab: 'overview' },
        { replace: false, state: { [OPENER]: true } }
      ),
    [go]
  );

  const setTab = useCallback(
    (store: string, tab: StoreTab) =>
      void go({ store, tab }, { replace: true, state: true }),
    [go]
  );

  const close = useCallback(() => {
    if (opened) {
      router.history.back();
      return;
    }
    void go(null, {
      replace: true,
      state: {},
      hash: (hash) => hash || 'releases',
    });
  }, [go, opened, router]);

  return { selection, open, setTab, close };
}
