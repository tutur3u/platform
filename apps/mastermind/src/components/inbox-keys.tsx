import type { KeyboardEvent } from 'react';

const CARD = '[data-inbox-card]';

/** Cards in list order, leaving out collapsed snoozed ones. */
export function visibleCards(root: HTMLElement | null) {
  return [...(root?.querySelectorAll<HTMLElement>(CARD) ?? [])].filter(
    (card) => !card.closest('[data-hidden]')
  );
}

export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border bg-muted px-1.5 font-mono text-muted-foreground text-xs">
      {children}
    </kbd>
  );
}

/**
 * J and K move between cards, a digit picks that option, R jumps to the
 * reply box, and Ctrl or Cmd with Enter there sends and moves on.
 */
export function onListKey(event: KeyboardEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement;
  if (target.closest('input, textarea, [role="menu"]')) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const cards = visibleCards(event.currentTarget);
  const current = target.closest<HTMLElement>(CARD);
  const index = current ? cards.indexOf(current) : -1;
  const key = event.key.toLowerCase();
  if (key === 'j' || key === 'k') {
    event.preventDefault();
    const next = cards[Math.max(0, index + (key === 'j' ? 1 : -1))];
    next?.focus();
  } else if (current && key === 'r') {
    event.preventDefault();
    current.querySelector<HTMLElement>('[data-reply]')?.focus();
  } else if (current && /^[1-9]$/.test(key)) {
    const option = current.querySelector<HTMLElement>(`[data-option="${key}"]`);
    if (option) {
      event.preventDefault();
      option.click();
    }
  }
}
