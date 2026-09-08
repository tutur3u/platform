'use client';
import { useQuery } from '@tanstack/react-query';
import { Settings2 } from '@tuturuuu/icons';
import { getMeetAiState } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AiCosts } from './ai-costs';
import { CloudflareCosts } from './cloudflare-costs';
import { RecordingHistory } from './recording-history';
export function EndedMeetingSettings({
  wsId,
  meetingId,
  canManage,
}: {
  canManage: boolean;
  wsId: string;
  meetingId: string;
}) {
  const t = useTranslations('meet.call');
  const [open, setOpen] = useState(false);
  const ai = useQuery({
    queryKey: ['meet-ai', wsId, meetingId],
    queryFn: () => getMeetAiState(wsId, meetingId),
    enabled: open && canManage,
    retry: false,
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Settings2 className="size-4" />
          {t('settings_title')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('settings_title')}</DialogTitle>
        </DialogHeader>
        <RecordingHistory meetingId={meetingId} />
        {canManage && <CloudflareCosts meetingId={meetingId} />}
        {canManage && ai.data && <AiCosts data={ai.data} />}
      </DialogContent>
    </Dialog>
  );
}
