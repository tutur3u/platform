import type { MailFolder } from './mail-folders';

export const MAIL_FOLDER_SHORTCUTS: Record<string, MailFolder> = {
  i: 'inbox',
  s: 'starred',
  t: 'sent',
  d: 'drafts',
  a: 'archive',
  p: 'spam',
  b: 'trash',
};
export type MailKeyboardCommand =
  | 'next'
  | 'previous'
  | 'first'
  | 'last'
  | 'open'
  | 'back'
  | 'select'
  | 'select_all'
  | 'archive'
  | 'trash'
  | 'star'
  | 'read'
  | 'unread'
  | 'reply'
  | 'reply_all'
  | 'forward'
  | 'compose'
  | 'search'
  | 'refresh'
  | 'help'
  | 'go';

export function mailKeyboardCommand(
  event: Pick<
    KeyboardEvent,
    'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
  >
): MailKeyboardCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (event.key === '?') return 'help';
  if (event.key === 'Escape') return 'back';
  if (event.shiftKey) {
    return (
      (
        {
          i: 'read',
          u: 'unread',
          x: 'select_all',
          r: 'refresh',
          '#': 'trash',
        } as Partial<Record<string, MailKeyboardCommand>>
      )[event.key.toLowerCase()] ?? null
    );
  }
  return (
    (
      {
        j: 'next',
        k: 'previous',
        ArrowDown: 'next',
        ArrowUp: 'previous',
        Home: 'first',
        End: 'last',
        o: 'open',
        u: 'back',
        x: 'select',
        e: 'archive',
        '#': 'trash',
        s: 'star',
        r: 'reply',
        a: 'reply_all',
        f: 'forward',
        c: 'compose',
        '/': 'search',
        g: 'go',
      } as Partial<Record<string, MailKeyboardCommand>>
    )[event.key] ?? null
  );
}

export function mailKeyboardTargetBlocked(target: EventTarget | null) {
  return (
    target !== null &&
    typeof (target as Element).closest === 'function' &&
    Boolean(
      (target as Element).closest(
        'input, textarea, select, video, audio, [contenteditable]:not([contenteditable="false"]), [role="checkbox"], [role="radio"], [role="switch"], [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="menu"], [role="listbox"], [role="dialog"], [data-mail-composer]'
      )
    )
  );
}
