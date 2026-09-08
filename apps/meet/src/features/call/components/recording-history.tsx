'use client';
import { useQuery } from '@tanstack/react-query';
import { Download } from '@tuturuuu/icons';
import { readMeetRecording, readMeetRecordings } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
export function RecordingHistory({ meetingId }: { meetingId: string }) {
  const t = useTranslations('meet.call');
  const [url, setUrl] = useState<string | null>(null);
  const records = useQuery({
    queryKey: ['meet-recordings', meetingId],
    queryFn: () => readMeetRecordings(meetingId),
    refetchInterval: 10000,
    retry: false,
  });
  if (records.isPending || records.error)
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {t(records.error ? 'recording_access_disabled' : 'upload_loading')}
      </p>
    );
  return (
    <>
      <div className="space-y-2">
        {records.data?.recordings
          .filter((r) => r.status === 'ready')
          .map((record) => (
            <Button
              key={record.sessionId}
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={async () => {
                try {
                  setUrl(
                    (await readMeetRecording(meetingId, record.sessionId)).url
                  );
                } catch {
                  toast.error(t('recording_unavailable'));
                }
              }}
            >
              <Download className="size-4" />
              {new Date(record.startedAt).toLocaleString()}
            </Button>
          ))}
        {!records.data?.recordings.some((r) => r.status === 'ready') && (
          <p className="text-muted-foreground text-xs">
            {t('recordings_empty')}
          </p>
        )}
      </div>
      {url && (
        <a
          href={url}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm underline"
        >
          <Download className="size-4" />
          {t('download_recording')}
        </a>
      )}
    </>
  );
}
