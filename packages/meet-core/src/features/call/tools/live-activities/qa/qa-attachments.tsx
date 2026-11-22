'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText } from '@tuturuuu/icons';
import { readMeetChatFile } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const PREVIEWABLE = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
]);

function QaAttachment({ meetingId, id }: { meetingId: string; id: string }) {
  const t = useTranslations('meet.call.live_activities.qa');
  // The same short-lived signed read the chat uses for room files.
  const file = useQuery({
    queryKey: ['meet-chat-file', meetingId, id],
    queryFn: () => readMeetChatFile(meetingId, id),
    staleTime: 60_000,
    retry: false,
  });
  const [previewFailed, setPreviewFailed] = useState(false);
  if (!file.data)
    return (
      <li className="flex h-9 items-center rounded-full border px-3 text-muted-foreground text-xs">
        {t(file.error ? 'attachment_unavailable' : 'attachment_loading')}
      </li>
    );
  const { url, name, contentType } = file.data;
  if (PREVIEWABLE.has(contentType) && !previewFailed)
    return (
      <li className="basis-full sm:basis-auto">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-xl border bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={url}
            alt={name}
            width={320}
            height={180}
            loading="lazy"
            decoding="async"
            className="max-h-44 w-full object-contain sm:w-56"
            onError={() => setPreviewFailed(true)}
          />
        </a>
      </li>
    );
  return (
    <li className="min-w-0 max-w-full">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-9 min-w-0 items-center gap-2 rounded-full border bg-background px-3 text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11"
      >
        <FileText className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{name}</span>
      </a>
    </li>
  );
}

/** Images as thumbnails and other files as chips, each opening a signed URL. */
export function QaAttachments({
  meetingId,
  ids,
  guest,
}: {
  meetingId: string;
  ids?: readonly string[];
  /** Room files open for signed-in people only. */
  guest?: boolean;
}) {
  const t = useTranslations('meet.call.live_activities.qa');
  if (!ids?.length) return null;
  if (guest)
    return (
      <p className="flex h-9 w-fit items-center gap-2 rounded-full border px-3 text-muted-foreground text-xs">
        <FileText className="size-4 shrink-0" />
        {t('attachments_sign_in', { count: ids.length })}
      </p>
    );
  return (
    <ul className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <QaAttachment key={id} meetingId={meetingId} id={id} />
      ))}
    </ul>
  );
}
