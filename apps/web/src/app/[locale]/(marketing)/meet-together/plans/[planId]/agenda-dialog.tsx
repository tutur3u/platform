'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { type JSONContent } from '@tuturuuu/ui/tiptap';
import { useTranslations } from 'next-intl';

interface AgendaDialogProps {
  agendaContent: JSONContent;
  trigger: React.ReactNode;
}

export default function AgendaDialog({
  agendaContent,
  trigger,
}: AgendaDialogProps) {
  const t = useTranslations('meet-together');

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">
            {t('agenda')}
          </DialogTitle>
          <DialogDescription>{t('agenda_description')}</DialogDescription>
        </DialogHeader>
        <RichTextEditor content={agendaContent} readOnly className="h-[60vh]" />
      </DialogContent>
    </Dialog>
  );
}
