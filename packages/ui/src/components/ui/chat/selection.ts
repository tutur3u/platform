'use client';

type SearchParamsLike = {
  toString: () => string;
};

type RouterLike = {
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

export type ChatDetailsTarget = 'agent' | null;

export function buildChatSelectionHref({
  conversationId,
  details = null,
  pathname,
  searchParams,
}: {
  conversationId: string | null;
  details?: ChatDetailsTarget;
  pathname: string;
  searchParams: SearchParamsLike;
}) {
  const nextParams = new URLSearchParams(searchParams.toString());

  if (conversationId) {
    nextParams.set('conversationId', conversationId);
  } else {
    nextParams.delete('conversationId');
  }

  if (details) {
    nextParams.set('details', details);
  } else {
    nextParams.delete('details');
  }

  const nextQuery = nextParams.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

export function replaceChatSelection({
  conversationId,
  details,
  pathname,
  router,
  searchParams,
  storageKey,
}: {
  conversationId: string | null;
  details?: ChatDetailsTarget;
  pathname: string;
  router: RouterLike;
  searchParams: SearchParamsLike;
  storageKey?: string | null;
}) {
  if (storageKey && typeof window !== 'undefined') {
    if (conversationId) {
      window.localStorage.setItem(storageKey, conversationId);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }

  router.replace(
    buildChatSelectionHref({
      conversationId,
      details,
      pathname,
      searchParams,
    }),
    { scroll: false }
  );
}
