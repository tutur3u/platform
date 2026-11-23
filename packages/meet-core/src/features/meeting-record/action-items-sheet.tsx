'use client';

import { useQuery } from '@tanstack/react-query';
import { getMeetFollowupContext } from '@tuturuuu/internal-api';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@tuturuuu/ui/sheet';
import { LoadingRegion, SkeletonLine } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { ActionItemsForm } from './action-items-form';
import type { ActionSuggestion } from './action-items';
import type { MeetingRecordLinks } from './meeting-record-panel';
import { useMeetingRecord } from './use-meeting-record';

/**
 * The "Save all action items" review. Tasks go to the meeting workspace so
 * each one links back to this meeting; the board defaults to the linked
 * Project's board.
 */
export function ActionItemsSheet({
  suggestions,
  onClose,
  ...links
}: MeetingRecordLinks & {
  suggestions: ActionSuggestion[];
  onClose: () => void;
}) {
  const { wsId, meetingId } = links;
  const t = useTranslations('meet.record.sheet');
  const record = useMeetingRecord(wsId, meetingId);
  const context = useQuery({
    queryKey: ['meeting-record-followup-context', wsId, meetingId],
    queryFn: () => getMeetFollowupContext(wsId, meetingId, wsId),
    retry: false,
    staleTime: 0,
  });

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <SheetContent className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>
        {context.isPending || record.isPending ? (
          <LoadingRegion className="space-y-3 px-4" srLabel={t('loading')}>
            <SkeletonLine barClassName="w-full" size="base" />
            <SkeletonLine barClassName="w-2/3" size="base" />
          </LoadingRegion>
        ) : context.isError || record.isError ? (
          <p className="px-4 text-muted-foreground text-sm">
            {t('unavailable')}
          </p>
        ) : (
          <ActionItemsForm
            {...links}
            context={context.data}
            defaultBoardId={record.data.defaultBoardId}
            onClose={onClose}
            suggestions={suggestions}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
