/** Cmd+Enter on Apple platforms and Ctrl+Enter elsewhere run the open code. */
export function isRunShortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
}) {
  return (
    event.key === 'Enter' &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.isComposing
  );
}

export function isApplePlatform(
  agent:
    | { platform?: string; userAgent?: string }
    | undefined = typeof navigator === 'undefined' ? undefined : navigator
) {
  return /Mac|iPhone|iPad|iPod/i.test(
    `${agent?.platform ?? ''} ${agent?.userAgent ?? ''}`
  );
}

/** Key names shown in the Run tooltip and hint, e.g. `["⌘", "Enter"]`. */
export function runShortcutKeys(apple = isApplePlatform()) {
  return [apple ? '⌘' : 'Ctrl', 'Enter'] as const;
}
