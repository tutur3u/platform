'use client';
import { uploadMeetRoomRecording } from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeetRoomController } from '../lib/room-controller';
import { RoomRecorder } from '../lib/room-recorder';

const MAX_RECORDING_BYTES = 55 * 1024 * 1024;
export function useRoomRecording(
  room: MeetRoomController,
  meetingId: string,
  streams: MediaStream[]
) {
  const t = useTranslations('meet.call'),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    mixer = useRef<RoomRecorder | null>(null),
    chunks = useRef<Blob[]>([]),
    session = useRef<string | null>(null),
    inflight = useRef(false),
    stopping = useRef<Promise<void> | null>(null),
    latestStreams = useRef(streams),
    cancelled = useRef(false),
    size = useRef(0),
    stopRef = useRef<() => Promise<void>>(() => Promise.resolve());
  latestStreams.current = streams;
  const control = room.controlRecording;
  const stop = useCallback(() => {
    cancelled.current = true;
    if (stopping.current) return stopping.current;
    const current = recorder.current,
      id = session.current;
    if (!current || !id) return Promise.resolve();
    recorder.current = null;
    setBusy(true);
    const task = (async () => {
      let backup: Blob | null = null;
      try {
        if (current.state !== 'inactive')
          await new Promise<void>((resolve) => {
            current.addEventListener('stop', () => resolve(), { once: true });
            current.stop();
          });
        const blob = new Blob(chunks.current, { type: current.mimeType });
        backup = blob;
        mixer.current?.dispose();
        if (!blob.size) throw new Error('Empty recording');
        await uploadMeetRoomRecording(meetingId, id, blob);
        toast.success(t('recording_saved'));
      } catch {
        const file = backup;
        toast.error(
          t('record_save_failed'),
          file?.size
            ? {
                duration: Infinity,
                action: {
                  label: t('save_recording_backup'),
                  onClick: () => {
                    const url = URL.createObjectURL(file);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = `meeting-recording.${file.type.includes('mp4') ? 'mp4' : 'webm'}`;
                    anchor.click();
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                  },
                },
              }
            : undefined
        );
      } finally {
        mixer.current?.dispose();
        mixer.current = null;
        chunks.current = [];
        session.current = null;
        setRecording(false);
        setBusy(false);
        await control('idle', id).catch(() => undefined);
      }
    })();
    stopping.current = task;
    void task.finally(() => {
      stopping.current = null;
    });
    return task;
  }, [control, meetingId, t]);
  stopRef.current = stop;
  useEffect(() => {
    mixer.current?.update(streams);
  }, [streams]);
  useEffect(
    () => () => {
      void stopRef.current();
    },
    []
  );
  useEffect(() => {
    if (
      recorder.current &&
      (room.state.recording.state === 'stopping' ||
        room.state.ended ||
        room.state.recording.ownerDeviceId !== room.state.selfUserId)
    )
      void stop();
  }, [room.state.recording, room.state.ended, room.state.selfUserId, stop]);
  const start = async () => {
    if (inflight.current || stopping.current) return;
    inflight.current = true;
    cancelled.current = false;
    setBusy(true);
    const id = crypto.randomUUID();
    let claimed = false;
    try {
      await control('starting', id);
      claimed = true;
      if (cancelled.current) return;
      const mix = new RoomRecorder();
      mixer.current = mix;
      const media = await mix.start(latestStreams.current);
      if (cancelled.current) return;
      const mimeType = [
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
        'audio/webm',
        'audio/mp4',
      ].find(
        (type) =>
          (media.getVideoTracks().length > 0 || type.startsWith('audio/')) &&
          MediaRecorder.isTypeSupported(type)
      );
      const current = new MediaRecorder(media, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 700000,
        audioBitsPerSecond: 64000,
      });
      chunks.current = [];
      size.current = 0;
      session.current = id;
      recorder.current = current;
      current.addEventListener('dataavailable', (event) => {
        if (event.data.size) {
          chunks.current.push(event.data);
          size.current += event.data.size;
          if (size.current >= MAX_RECORDING_BYTES) {
            toast.info(t('recording_size_limit'));
            void stopRef.current();
          }
        }
      });
      current.addEventListener('error', () => {
        toast.error(t('record_save_failed'));
        void stopRef.current();
      });
      current.start(1000);
      await control('recording', id);
      setRecording(true);
    } catch {
      toast.error(t('record_start_failed'));
      cancelled.current = true;
    } finally {
      if (cancelled.current) {
        if (recorder.current) await stop();
        else {
          mixer.current?.dispose();
          mixer.current = null;
          if (claimed) await control('error', id).catch(() => undefined);
        }
      }
      setBusy(false);
      inflight.current = false;
    }
  };
  const toggle = async () => {
    if (
      room.state.recording.state === 'recording' ||
      room.state.recording.state === 'starting'
    ) {
      await control('stopping', room.state.recording.sessionId ?? undefined);
      if (recording) await stop();
    } else await start();
  };
  return { isBusy: busy, isRecording: recording, stop, toggle };
}
