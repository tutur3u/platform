'use client';

import type { MeetAiState } from '@tuturuuu/internal-api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import { MeetingNotesTab } from './meeting-notes-tab';
import {
  MeetingTranscriptTab,
  type TranscriptFocus,
} from './meeting-transcript-tab';
import { toTranscriptLines } from './transcript-lines';

type Tab = 'notes' | 'transcript';

/** Renders only data the server already authorized for this viewer. */
export function MeetingNotesView({
  wsId,
  meetingId,
  title,
  data,
  isLoading,
  error,
  hostActions,
  visibility,
}: {
  wsId: string;
  meetingId: string;
  title: string;
  data: MeetAiState | undefined;
  isLoading: boolean;
  error: unknown;
  hostActions?: ReactNode;
  visibility?: ReactNode;
}) {
  const t = useTranslations('meet.notes_page');
  const [tab, setTab] = useState<Tab>('notes');
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<TranscriptFocus>(null);
  const lines = useMemo(() => toTranscriptLines(data?.chunks ?? []), [data]);

  const jump = (lineId: string) => {
    setQuery('');
    setFocus((current) => ({ lineId, nonce: (current?.nonce ?? 0) + 1 }));
    setTab('transcript');
  };

  return (
    <section
      aria-labelledby="meeting-notes-title"
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="meeting-notes-title" className="font-semibold text-lg">
            {t('title')}
          </h2>
          <p className="text-muted-foreground text-xs">{t('ai_notice')}</p>
        </div>
        {hostActions}
      </div>
      {visibility}
      {isLoading ? (
        <output className="block text-muted-foreground text-sm">
          {t('loading')}
        </output>
      ) : error && !data ? (
        <p role="alert" className="text-destructive text-sm">
          {t('unavailable')}
        </p>
      ) : data ? (
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="notes" className="flex-1 sm:flex-none">
              {t('tab_notes')}
            </TabsTrigger>
            <TabsTrigger value="transcript" className="flex-1 sm:flex-none">
              {t('tab_transcript')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="notes" className="pt-4">
            <MeetingNotesTab
              wsId={wsId}
              meetingId={meetingId}
              sessions={data.sessions}
              lines={lines}
              onJump={jump}
            />
          </TabsContent>
          <TabsContent value="transcript" className="pt-4">
            <MeetingTranscriptTab
              title={title}
              lines={lines}
              query={query}
              onQueryChange={setQuery}
              focus={focus}
            />
          </TabsContent>
        </Tabs>
      ) : null}
    </section>
  );
}
