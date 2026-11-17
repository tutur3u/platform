'use client';

import type { JSONContent } from '@tiptap/react';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import {
  createQuickCreateDescription,
  getQuickCreateDescriptionText,
} from './quick-create-description';

interface QuickCreateDescriptionInputProps {
  description: JSONContent | null;
  disabled?: boolean;
  onDescriptionChange: (description: JSONContent | null) => void;
  /** Rich descriptions open the full editor instead of a plain field. */
  onOpenEditor: () => void;
}

/** The optional one-line description under the quick-create title. */
export function QuickCreateDescriptionInput({
  description,
  disabled,
  onDescriptionChange,
  onOpenEditor,
}: QuickCreateDescriptionInputProps) {
  const t = useTranslations('ws-task-boards.dialog.quick_create');
  const text = getQuickCreateDescriptionText(description);

  if (text === null) {
    return (
      <button
        type="button"
        onClick={onOpenEditor}
        className="w-full rounded-md text-left text-muted-foreground text-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:text-base"
      >
        {t('open_full_editor')}
      </button>
    );
  }

  return (
    <Textarea
      data-quick-create-description
      aria-label={t('add_description')}
      placeholder={t('add_description')}
      value={text}
      disabled={disabled}
      rows={1}
      onChange={(event) =>
        onDescriptionChange(createQuickCreateDescription(event.target.value))
      }
      className="field-sizing-content max-h-40 min-h-6 resize-none overflow-y-auto border-0 bg-transparent px-0 py-0 text-foreground text-sm shadow-none placeholder:text-muted-foreground focus-visible:ring-0 max-sm:text-base"
    />
  );
}
