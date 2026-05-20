'use client';

import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import type { Dispatch, SetStateAction } from 'react';
import type { AnnouncementFormValues } from './announcement-form-state';

interface Props {
  form: AnnouncementFormValues;
  setForm: Dispatch<SetStateAction<AnnouncementFormValues>>;
}

export function AnnouncementFormMessageStep({ form, setForm }: Props) {
  const t = useTranslations('ws-topic-announcements');

  return (
    <div className="space-y-4 rounded-md border bg-background p-4">
      <div>
        <h3 className="font-medium text-base">{t('announcement_message')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('announcement_message_helper')}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="topic-body">{t('topic_primary_label')}</Label>
        <Textarea
          className="min-h-[280px]"
          id="topic-body"
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              topic: event.target.value,
            }))
          }
          placeholder={t('topic_primary_placeholder')}
          value={form.topic}
        />
      </div>
    </div>
  );
}
