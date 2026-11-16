import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { MailComposerAttachmentChip } from './mail-composer-attachment-chip';
import type { MailMediaItem } from './mail-composer-upload-state';

export function MailComposerAttachments({
  items,
  onRemove,
  onRetry,
}: {
  items: MailMediaItem[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const t = useTranslations('mail');
  const list = useRef<HTMLUListElement>(null);
  // '' means "no sibling left": focus returns to the attach button.
  const focusAfterRemoval = useRef<string | null>(null);

  useEffect(() => {
    const target = focusAfterRemoval.current;
    if (target === null) return;
    focusAfterRemoval.current = null;
    const sibling = target
      ? Array.from(
          list.current?.querySelectorAll<HTMLElement>('[data-chip-remove]') ??
            []
        ).find((element) => element.dataset.chipRemove === target)
      : undefined;
    (
      sibling ??
      document.querySelector<HTMLElement>('[data-mail-attach-trigger]')
    )?.focus();
  }, [items]);

  if (items.length === 0) return null;

  const remove = (id: string) => {
    if (list.current?.contains(document.activeElement)) {
      const index = items.findIndex((item) => item.id === id);
      focusAfterRemoval.current = (items[index + 1] ?? items[index - 1])?.id ?? '';
    }
    onRemove(id);
  };

  return (
    <ul
      aria-label={t('attachments')}
      className="flex flex-wrap gap-2 border-dynamic border-t px-3 py-2"
      ref={list}
    >
      {items.map((item) => (
        <MailComposerAttachmentChip
          item={item}
          key={item.id}
          onRemove={remove}
          onRetry={onRetry}
        />
      ))}
    </ul>
  );
}
