'use client';

import { Eye } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';

/** Read the full content already supplied by the authorized session list. */
export function TutoringSessionContent({ content }: { content: string }) {
  const t = useTranslations('ws-tutoring');
  if (!content.trim()) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          aria-label={t('view_content')}
          className="h-auto max-w-56 justify-start p-0 text-left font-normal text-muted-foreground text-xs"
          type="button"
          variant="link"
        >
          <Eye className="size-3.5 shrink-0" />
          <span className="line-clamp-1">{content}</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{t('content')}</DialogTitle>
        </DialogHeader>
        <p className="whitespace-pre-wrap break-words text-sm">{content}</p>
      </DialogContent>
    </Dialog>
  );
}
