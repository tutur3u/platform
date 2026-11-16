import type { KeyboardEvent } from 'react';

const CHOICE = '[data-workspace-choice]';
const ROW_FOCUSABLE = `${CHOICE}, [data-picker-action]:not(:disabled)`;

export function isPickerSearch(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    target.dataset.testid === 'workspace-picker-search'
  );
}

function choices(list: HTMLElement | null) {
  return Array.from(
    list?.querySelectorAll<HTMLElement>(`${CHOICE}:not(:disabled)`) ?? []
  );
}

/**
 * Keyboard model: Arrow Up/Down and Home/End move between workspace rows,
 * Arrow Left/Right move between a row's main choice and its actions. Search
 * keeps native Home/End text editing. Returns the workspace id that received
 * focus, if any.
 */
export function handlePickerListKey(
  event: KeyboardEvent<HTMLElement>,
  list: HTMLElement | null
): string | undefined {
  if (event.defaultPrevented) return;
  const target = event.target as HTMLElement | null;
  const fromSearch = isPickerSearch(target);
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (fromSearch) return;
    const row = target?.closest('[data-picker-row]');
    if (!row) return;
    const items = Array.from(row.querySelectorAll<HTMLElement>(ROW_FOCUSABLE));
    const index = items.indexOf(target as HTMLElement);
    if (index === -1) return;
    const next = items[index + (event.key === 'ArrowRight' ? 1 : -1)];
    if (!next) return;
    event.preventDefault();
    next.focus();
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  if (fromSearch && (event.key === 'Home' || event.key === 'End')) return;
  const buttons = choices(list);
  if (!buttons.length) return;
  event.preventDefault();
  const currentRow = target?.closest('[data-picker-row]');
  const currentChoice = currentRow?.querySelector(CHOICE) ?? null;
  const index = buttons.findIndex((button) => button === currentChoice);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : event.key === 'ArrowDown'
          ? (index + 1) % buttons.length
          : (index <= 0 ? buttons.length : index) - 1;
  const button = buttons[next];
  button?.focus();
  return button?.dataset.workspaceId;
}
