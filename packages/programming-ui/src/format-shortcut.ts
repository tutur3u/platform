/**
 * Shift+Alt+F formats the open file. It is matched on the physical key so the
 * character Option+Shift+F types on Apple keyboards does not hide it.
 */
export function isFormatShortcut(event: {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
}) {
  return (
    event.code === 'KeyF' &&
    event.altKey &&
    event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.isComposing
  );
}

export const FORMAT_SHORTCUT = 'Shift+Alt+F';
