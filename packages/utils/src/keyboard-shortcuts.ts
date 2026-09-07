/** Shared guards for document/window keyboard commands. */
export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  return (
    typeof Element !== 'undefined' &&
    target instanceof Element &&
    Boolean(
      target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]'
      )
    )
  );
}

export function isShortcutEventIgnored(
  event: Pick<KeyboardEvent, 'defaultPrevented' | 'isComposing' | 'repeat'>
): boolean {
  return event.defaultPrevented || event.isComposing || event.repeat;
}

export function isPageShortcutBlocked(event: KeyboardEvent): boolean {
  if (isShortcutEventIgnored(event) || isEditableShortcutTarget(event.target))
    return true;
  const target = event.target;
  if (
    typeof Element !== 'undefined' &&
    target instanceof Element &&
    target.closest(
      '[role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"]'
    )
  )
    return true;
  return (
    typeof document !== 'undefined' &&
    Boolean(
      document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
      )
    )
  );
}
