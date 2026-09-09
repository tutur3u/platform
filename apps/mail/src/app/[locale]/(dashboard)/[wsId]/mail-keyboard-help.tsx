'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useMailKeyboardPreference } from './mail-keyboard-preference';

export function MailKeyboardSetting() {
  const t = useTranslations('mail');
  const [enabled, setEnabled] = useMailKeyboardPreference();
  return (
    <Label className="flex items-center justify-between gap-4 rounded-lg border border-dynamic p-3">
      <span>
        <span className="block font-medium">{t('keyboard_enabled')}</span>
        <span className="mt-1 block text-muted-foreground text-xs leading-5">
          {t('keyboard_enabled_description')}
        </span>
      </span>
      <Switch
        checked={enabled}
        onCheckedChange={setEnabled}
        aria-label={t('keyboard_enabled')}
      />
    </Label>
  );
}

export function MailKeyboardHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('mail');
  const groups = [
    [
      'keyboard_navigation',
      [
        ['j / k · ↑ / ↓', 'keyboard_move'],
        ['Home / End', 'keyboard_edges'],
        ['Enter / o', 'keyboard_open'],
        ['u / Esc', 'keyboard_back'],
        ['/', 'search'],
        ['Shift + R', 'refresh'],
        ['?', 'keyboard_shortcuts'],
      ],
    ],
    [
      'keyboard_actions',
      [
        ['x', 'select_thread'],
        ['Shift + X', 'select_loaded'],
        ['e', 'archive'],
        ['#', 'trash'],
        ['s', 'star'],
        ['Shift + I', 'mark_read'],
        ['Shift + U', 'mark_unread'],
        ['c', 'compose'],
        ['r', 'reply'],
        ['a', 'reply_all'],
        ['f', 'forward'],
      ],
    ],
    [
      'keyboard_folders',
      [
        ['g → i', 'inbox'],
        ['g → s', 'starred'],
        ['g → t', 'sent'],
        ['g → d', 'drafts'],
        ['g → a', 'archive'],
        ['g → p', 'spam'],
        ['g → b', 'trash'],
      ],
    ],
    [
      'keyboard_composer',
      [
        ['Ctrl / ⌘ + Enter', 'send'],
        ['Ctrl / ⌘ + S', 'save'],
        ['Ctrl / ⌘ + J', 'ai_compose_title'],
        ['Esc', 'save_and_close'],
        ['Ctrl / ⌘ + B / I', 'keyboard_format'],
        ['Ctrl / ⌘ + Z', 'keyboard_undo'],
      ],
    ],
  ] as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('keyboard_shortcuts')}</DialogTitle>
          <DialogDescription>{t('keyboard_description')}</DialogDescription>
        </DialogHeader>
        <MailKeyboardSetting />
        <div className="grid gap-5 sm:grid-cols-2">
          {groups.map(([title, entries]) => (
            <section key={title}>
              <h3 className="mb-2 font-semibold text-sm">{t(title)}</h3>
              <dl className="space-y-2">
                {entries.map(([keys, label]) => (
                  <div
                    key={keys}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <dt>{t(label)}</dt>
                    <dd className="shrink-0">
                      <kbd className="rounded border border-dynamic bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {keys}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="text-muted-foreground text-xs leading-5">
          {t('keyboard_actions_description')}
        </p>
      </DialogContent>
    </Dialog>
  );
}
