// Native keydown events the quick-create panel already turned into a save.
const handledSaveShortcuts = new WeakSet<Event>();

/** Records that this Cmd/Ctrl+Enter press already saved the task. */
export function markTaskSaveShortcutHandled(event: Event) {
  handledSaveShortcuts.add(event);
}

/** Lets the dialog's window-level shortcut skip a press the panel handled. */
export function isTaskSaveShortcutHandled(event: Event) {
  return handledSaveShortcuts.has(event);
}
