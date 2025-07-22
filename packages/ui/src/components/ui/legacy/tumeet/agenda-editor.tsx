'use client';

import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import type { JSONContent } from '@tuturuuu/ui/tiptap';
import { useTranslations } from 'next-intl';

interface AgendaEditorProps {
  content: JSONContent | null;
  onChange: (content: JSONContent) => void;
  readOnly?: boolean;
}

export function AgendaEditor({
  content,
  onChange,
  readOnly = false,
}: AgendaEditorProps) {
  const t = useTranslations('meet-together');

  return (
    <div className="h-64 overflow-y-auto">
      <RichTextEditor
        content={content}
        onChange={onChange}
        readOnly={readOnly}
        titlePlaceholder={t('agenda_title_placeholder')}
        writePlaceholder={t('agenda_content_placeholder')}
        saveButtonLabel={t('save_agenda')}
        savedButtonLabel={t('agenda_saved')}
      />
    </div>
  );
}
