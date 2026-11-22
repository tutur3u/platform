/** The parts of a keyboard event the event dialog shortcuts read. */
export interface EventDialogKey {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** True while an input method (such as Vietnamese Telex) is composing. */
  isComposing?: boolean;
}

/** Cmd+Enter (macOS) or Ctrl+Enter saves from any field, the description too. */
export function isEventDialogSubmitShortcut(event: EventDialogKey): boolean {
  return (
    event.key === 'Enter' &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.isComposing
  );
}

/** A plain Enter in a single-line field (title, location) saves too. */
export function isEventFieldSubmitKey(event: EventDialogKey): boolean {
  return (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.isComposing
  );
}

/** Reads a React keyboard event, including the input method state. */
export function eventDialogKey(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  nativeEvent: { isComposing?: boolean };
}): EventDialogKey {
  return {
    key: event.key,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    isComposing: event.nativeEvent.isComposing,
  };
}

/** "GMT+7 · Ho Chi Minh" for the zone the dialog's times are in. */
export function formatEventTimeZone(
  timeZone: string | undefined,
  at: Date,
  locale?: string
): string {
  const zone =
    timeZone && timeZone !== 'auto'
      ? timeZone
      : Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    const offset = new Intl.DateTimeFormat(locale ?? 'en-US', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value;
    const city = zone.split('/').pop()?.replaceAll('_', ' ');
    return [offset, city].filter(Boolean).join(' · ');
  } catch {
    return zone;
  }
}
