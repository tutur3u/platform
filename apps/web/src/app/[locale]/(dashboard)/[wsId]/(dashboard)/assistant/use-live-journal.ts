'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLiveAPIContext } from '@/hooks/use-live-api';
import {
  appendLiveTranscript,
  finishLiveTranscript,
  type LiveTranscriptEntry,
} from './live-session-journal';

export function useLiveJournal() {
  const { client } = useLiveAPIContext();
  const [entries, setEntries] = useState<LiveTranscriptEntry[]>([]);
  const append = useCallback(
    (role: LiveTranscriptEntry['role'], text: string) => {
      setEntries((current) =>
        appendLiveTranscript(current, role, text, crypto.randomUUID())
      );
    },
    []
  );
  useEffect(() => {
    const input = (text: string) => append('user', text);
    const output = (text: string) => append('assistant', text);
    const finish = () => setEntries((current) => finishLiveTranscript(current));
    const interrupt = () =>
      setEntries((current) => finishLiveTranscript(current, true));
    client
      .on('inputtranscription', input)
      .on('transcription', output)
      .on('turncomplete', finish)
      .on('interrupted', interrupt)
      .on('close', finish);
    return () => {
      client
        .off('inputtranscription', input)
        .off('transcription', output)
        .off('turncomplete', finish)
        .off('interrupted', interrupt)
        .off('close', finish);
    };
  }, [append, client]);
  const sendText = useCallback(
    (text: string) => {
      client.send({ text }, true);
      append('user', text);
      setEntries((current) => finishLiveTranscript(current));
    },
    [append, client]
  );
  return { entries, sendText };
}
