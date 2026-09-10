'use client';
import { controlMeetLive } from '@tuturuuu/internal-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { captureLiveAudio, LiveAudioPlayer } from './audio';
import type {
  LiveAssistantEvent,
  LiveAudience,
  LiveClientCommand,
} from './contracts';

type ActiveSession = {
  sessionId: string;
  socket?: WebSocket;
  player: LiveAudioPlayer;
  disposeCapture?: () => void;
  updateCapture?: (streams: MediaStream[]) => void;
  mode: LiveAudience;
  paused: boolean;
  ready: boolean;
  microphone?: MediaStream;
  stopped: boolean;
  reconnect?: ReturnType<typeof setTimeout>;
  retries: number;
};
type Review = Extract<LiveAssistantEvent, { type: 'review' }>;
export function useLiveAssistant(
  meetingId: string,
  outputDeviceId: string,
  roomAudio: { streams: MediaStream[]; microphoneEnabled: boolean }
) {
  const [status, setStatus] = useState('idle');
  const [mode, setMode] = useState<LiveAudience>('personal');
  const [transcript, setTranscript] = useState<
    Array<{ role: string; text: string }>
  >([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [usage, setUsage] = useState({ costUsd: 0, incomplete: true });
  const [organized, setOrganized] = useState(false);
  const [error, setError] = useState<string>();
  const active = useRef<ActiveSession | undefined>(undefined);
  const startGeneration = useRef(0);
  const starting = useRef(false);
  const roomAudioRef = useRef(roomAudio);
  roomAudioRef.current = roomAudio;
  const send = useCallback((message: LiveClientCommand) => {
    const current = active.current;
    if (!current) return;
    if (message.type === 'pause') {
      current.paused = message.paused;
      if (message.paused) current.player.interrupt();
    }
    if (
      message.type === 'audio' &&
      (!current.ready ||
        current.paused ||
        (current.mode === 'personal' && roomAudioRef.current.microphoneEnabled))
    )
      return;
    const socket = current.socket;
    if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 64000)
      socket.send(JSON.stringify(message));
  }, []);
  const stop = async (remote = true) => {
    ++startGeneration.current;
    starting.current = false;
    setStatus('idle');
    const current = active.current;
    if (!current) return;
    current.stopped = true;
    clearTimeout(current.reconnect);
    current.disposeCapture?.();
    current.microphone?.getTracks().forEach((track) => {
      track.stop();
    });
    current.player.close();
    if (remote) send({ type: 'stop' });
    current.socket?.close();
    active.current = undefined;
    setStatus('idle');
    if (remote)
      await controlMeetLive(meetingId, {
        action: 'stop',
        sessionId: current.sessionId,
      }).catch(() => setError('stop_failed'));
  };
  const connect = async (token: string) => {
    const current = active.current;
    if (!current || current.stopped) return;
    const url = new URL('/live-connect', window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url, ['meet-live', `auth.${token}`]);
    current.socket = socket;
    socket.onmessage = (event) => {
      if (
        active.current !== current ||
        current.stopped ||
        current.socket !== socket
      )
        return;
      const message = JSON.parse(event.data) as LiveAssistantEvent;
      if (message.type === 'state') {
        const wasReady = current.ready;
        current.ready = ['listening', 'paused'].includes(message.state);
        if (!wasReady && current.ready && current.paused)
          socket.send(JSON.stringify({ type: 'pause', paused: true }));
        setStatus(message.state);
        if (message.detail) setError(message.detail);
      }
      if (
        message.type === 'audio' &&
        !current.paused &&
        !(current.mode === 'personal' && roomAudioRef.current.microphoneEnabled)
      )
        current.player.play(message.data, message.sampleRate);
      if (message.type === 'interrupt') current.player.interrupt();
      if (message.type === 'usage') setUsage(message);
      if (message.type === 'context') setOrganized(message.compressed);
      if (message.type === 'review')
        setReviews((items) =>
          [...items.filter((item) => item.id !== message.id), message].slice(
            -20
          )
        );
      if (message.type === 'transcript' && message.text)
        setTranscript((items) => {
          const last = items.at(-1);
          if (last?.role === message.role)
            return [
              ...items.slice(0, -1),
              { ...last, text: (last.text + message.text).slice(-8000) },
            ];
          return [
            ...items.slice(-39),
            { role: message.role, text: message.text },
          ];
        });
    };
    socket.onopen = () => {
      if (active.current !== current || current.socket !== socket) return;
      current.retries = 0;
      setError(undefined);
    };
    socket.onclose = (event) => {
      if (
        current.stopped ||
        active.current !== current ||
        current.socket !== socket
      )
        return;
      current.ready = false;
      if (event.code === 1000 || event.code === 4001) {
        // A moved session belongs to the replacement device now.
        void stop(false);
        return;
      }
      if (++current.retries > 8) {
        void stop();
        return;
      }
      setStatus('recovering');
      current.player.interrupt();
      current.reconnect = setTimeout(
        async () => {
          try {
            const next = await controlMeetLive(meetingId, {
              action: 'resume',
              sessionId: current.sessionId,
            });
            if (active.current === current && !current.stopped)
              await connect(next.token);
          } catch {
            if (active.current === current && !current.stopped) {
              setError('reconnect_failed');
              void stop();
            }
          }
        },
        Math.min(1000 * 2 ** current.retries, 15000)
      );
    };
  };
  const start = async (
    audience: LiveAudience,
    streams: MediaStream[],
    inputDeviceId: string
  ) => {
    if (active.current || starting.current) return;
    starting.current = true;
    const generation = ++startGeneration.current;
    const cancelled = () => generation !== startGeneration.current;
    setStatus('connecting');
    setError(undefined);
    setMode(audience);
    setTranscript([]);
    setReviews([]);
    const player = new LiveAudioPlayer();
    let microphone: MediaStream | undefined;
    try {
      await player.unlock(outputDeviceId);
      if (audience === 'personal')
        microphone = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: false,
        });
      if (cancelled()) throw new Error('Cancelled');
      const session = await controlMeetLive(meetingId, {
        action: 'start',
        mode: audience,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (cancelled()) {
        await controlMeetLive(meetingId, {
          action: 'stop',
          sessionId: session.sessionId,
        });
        throw new Error('Cancelled');
      }
      const current = {
        sessionId: session.sessionId,
        player,
        microphone,
        stopped: false,
        retries: 0,
        mode: audience,
        paused: false,
        ready: false,
      } as ActiveSession;
      active.current = current;
      await connect(session.token);
      const capture = await captureLiveAudio(
        microphone ? [microphone] : streams,
        (data) => {
          if (active.current === current && !current.stopped)
            send({ type: 'audio', data });
        }
      );
      if (current.stopped) capture.dispose();
      else {
        current.disposeCapture = capture.dispose;
        current.updateCapture = capture.update;
      }
    } catch {
      player.close();
      microphone?.getTracks().forEach((track) => {
        track.stop();
      });
      if (!cancelled()) {
        setError('start_failed');
        await stop();
        setStatus('error');
      }
    } finally {
      if (!cancelled()) starting.current = false;
    }
  };
  useEffect(() => {
    if (active.current?.mode === 'room')
      active.current.updateCapture?.(roomAudio.streams);
  }, [roomAudio.streams]);
  useEffect(
    () => () => {
      ++startGeneration.current;
      starting.current = false;
      const current = active.current;
      if (!current) return;
      current.stopped = true;
      clearTimeout(current.reconnect);
      current.disposeCapture?.();
      current.microphone?.getTracks().forEach((track) => {
        track.stop();
      });
      current.player.close();
      current.socket?.close(1000, 'Left meeting');
    },
    []
  );
  return {
    status,
    mode,
    transcript,
    reviews,
    usage,
    organized,
    error,
    start,
    stop,
    send,
  };
}
