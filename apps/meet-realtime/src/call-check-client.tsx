import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
/** Runtime verification of the actual React call controller with synthetic media. */
import { NextIntlClientProvider } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import messages from '../../meet/messages/en.json';
import { CallSettings } from '../../meet/src/features/call/components/call-settings';
import { ParticipantTile } from '../../meet/src/features/call/components/participant-tile';
import { ParticipantsPanel } from '../../meet/src/features/call/components/participants-panel';
import { useMeetRoom } from '../../meet/src/features/call/hooks/use-meet-room';
import type { useMeetingAi } from '../../meet/src/features/meeting-ai/use-meeting-ai';

const requestedPeer = new URL(location.href).searchParams.get('peer');
const peer =
  requestedPeer === 'b' || requestedPeer === 'c' ? requestedPeer : 'a';
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (/\/api\/meet-call\/[^/]+\/token$/.test(url))
    return nativeFetch(`/token?peer=${peer}`).then(async (response) => {
      const data = await response.json();
      return Response.json({ ...data, realtimeUrl: data.roomUrl });
    });
  return nativeFetch(input, init);
};
const peers = new Set<RTCPeerConnection>();
const NativePeer = window.RTCPeerConnection;
window.RTCPeerConnection = class extends NativePeer {
  constructor(configuration?: RTCConfiguration) {
    super(
      new URL(location.href).searchParams.has('relay')
        ? { ...configuration, iceTransportPolicy: 'relay' }
        : configuration
    );
    peers.add(this);
  }
  override setConfiguration(configuration: RTCConfiguration) {
    if (new URL(location.href).searchParams.get('relay') === 'tls') {
      configuration = {
        ...configuration,
        iceTransportPolicy: 'relay',
        iceServers: configuration.iceServers
          ?.map((server) => ({
            ...server,
            urls: (Array.isArray(server.urls)
              ? server.urls
              : [server.urls]
            ).filter(
              (url) => url === 'turns:turn.cloudflare.com:443?transport=tcp'
            ),
          }))
          .filter((server) => server.urls.length),
      };
    }
    super.setConfiguration(configuration);
  }
};
const sockets: WebSocket[] = [];
const NativeWebSocket = window.WebSocket;
window.WebSocket = class extends NativeWebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    sockets.push(this);
  }
};
let sharedStream: MediaStream | null = null;
const contexts = new Set<AudioContext>();
document.addEventListener('pointerdown', () => {
  for (const context of contexts) {
    if (context.state === 'suspended') void context.resume();
  }
});
function camera(screen = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext('2d')!;
  const timer = setInterval(() => {
    context.fillStyle = screen
      ? '#125544'
      : peer === 'a'
        ? '#203080'
        : '#802030';
    context.fillRect(0, 0, 640, 360);
    context.fillStyle = 'white';
    context.font = '32px sans-serif';
    context.fillText(
      `${screen ? 'SCREEN' : 'CAMERA'} ${peer} ${Date.now()}`,
      20,
      100
    );
  }, 100);
  const stream = canvas.captureStream(10);
  const track = stream.getVideoTracks()[0]!;
  const stop = track.stop.bind(track);
  track.stop = () => {
    clearInterval(timer);
    stop();
  };
  return stream;
}
navigator.mediaDevices.getUserMedia = async (constraints) => {
  const tracks: MediaStreamTrack[] = [];
  if (constraints?.video) tracks.push(...camera().getTracks());
  if (constraints?.audio) {
    const context = new AudioContext();
    contexts.add(context);
    await context.resume();
    const oscillator = context.createOscillator();
    oscillator.frequency.value = peer === 'a' ? 440 : 660;
    const output = context.createMediaStreamDestination();
    oscillator.connect(output);
    oscillator.start();
    const track = output.stream.getAudioTracks()[0]!;
    const stop = track.stop.bind(track);
    track.stop = () => {
      stop();
      oscillator.stop();
      contexts.delete(context);
      void context.close();
    };
    tracks.push(track);
  }
  return new MediaStream(tracks);
};
navigator.mediaDevices.getDisplayMedia = async () => {
  sharedStream = camera(true);
  const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of audio.getAudioTracks()) sharedStream.addTrack(track);
  return sharedStream;
};

const config = await fetch(`/token?peer=${peer}`).then((response) =>
  response.json()
);
function RemotePeer({
  entry,
  tracks,
}: {
  entry: import('@tuturuuu/realtime/meet').MeetRealtimePresence;
  tracks: import('../../meet/src/features/call/lib/remote-streams').RemoteMedia[string];
}) {
  const camera = useMemo(
    () =>
      new MediaStream(
        [tracks?.audio, tracks?.video].filter(
          (track): track is MediaStreamTrack => Boolean(track)
        )
      ),
    [tracks?.audio, tracks?.video]
  );
  const screen = useMemo(
    () =>
      new MediaStream(
        [tracks?.screen, tracks?.screen_audio].filter(
          (track): track is MediaStreamTrack => Boolean(track)
        )
      ),
    [tracks?.screen, tracks?.screen_audio]
  );
  return (
    <>
      <ParticipantTile
        resumePlaybackLabel="Play meeting audio"
        participant={entry}
        stream={camera}
      />
      {entry.media.screenEnabled && (
        <ParticipantTile
          resumePlaybackLabel="Play screen audio"
          participant={entry}
          kind="screen"
          stream={screen}
        />
      )}
    </>
  );
}
function CallCheck() {
  const room = useMeetRoom({
    meetingId: config.meetingId,
    wsId: config.wsId,
    realtimeUrl: config.roomUrl,
    token: config.token,
  });
  const [frames, setFrames] = useState(0);
  const [playback, setPlayback] = useState('pending');
  useEffect(() => {
    const timer = setInterval(
      () =>
        setFrames(
          [...document.querySelectorAll('section video')].reduce(
            (total, element) =>
              total +
              (element as HTMLVideoElement).getVideoPlaybackQuality()
                .totalVideoFrames,
            0
          )
        ),
      1000
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setPlayback(
          [...document.querySelectorAll('section video')]
            .map((element) =>
              (element as HTMLVideoElement).paused ? 'paused' : 'playing'
            )
            .join(', ')
        ),
      1000
    );
    return () => clearInterval(timer);
  }, []);
  const [outputDeviceId, setOutputDeviceId] = useState('');
  const [sound, setSound] = useState(true);
  const [showRequest, setShowRequest] = useState(true);
  const [diagnostics, setDiagnostics] = useState('');
  const [error, setError] = useState('');
  const [energy, setEnergy] = useState<Record<string, number>>({});
  useEffect(() => {
    const audioContexts: AudioContext[] = [];
    const timers: ReturnType<typeof setInterval>[] = [];
    for (const [userId, tracks] of Object.entries(room.remoteMedia)) {
      for (const kind of ['audio', 'screen_audio'] as const) {
        const track = tracks[kind];
        if (!track) continue;
        const id = `${userId}:${kind}`;
        const stream = new MediaStream([track]);
        const context = new AudioContext();
        audioContexts.push(context);
        contexts.add(context);
        void context.resume();
        const analyser = context.createAnalyser();
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        timers.push(
          setInterval(() => {
            analyser.getByteTimeDomainData(samples);
            const level =
              samples.reduce((sum, value) => sum + Math.abs(value - 128), 0) /
              samples.length;
            setEnergy((current) => ({ ...current, [id]: level }));
          }, 500)
        );
      }
    }
    return () => {
      for (const timer of timers) clearInterval(timer);
      for (const context of audioContexts) {
        contexts.delete(context);
        void context.close();
      }
    };
  }, [room.remoteMedia]);
  const run = (action: () => Promise<void>) => {
    setError('');
    void action().catch((error) => setError(String(error)));
  };
  return (
    <main>
      {new URL(location.href).searchParams.has('ui') && (
        <div className="flex items-start gap-4 rounded-xl border p-4">
          <CallSettings
            room={room}
            meetingId={config.meetingId}
            ai={{ data: undefined } as ReturnType<typeof useMeetingAi>}
            canManage={room.state.role === 'host'}
            sound={sound}
            onSound={() => setSound(!sound)}
            outputDeviceId={outputDeviceId}
            onOutput={setOutputDeviceId}
          />
          <aside className="flex h-96 w-80 flex-col rounded-xl border bg-background">
            <ParticipantsPanel
              approved={room.state.approved}
              onForget={room.forgetParticipant}
              shareNotes={false}
              onShareNotes={() => undefined}
              canManage={room.state.role === 'host'}
              onDecideAdmission={() => setShowRequest(false)}
              onMute={() => undefined}
              onRemove={() => undefined}
              participants={Object.values(room.state.participants)}
              raisedHandUserIds={[]}
              selfUserId={room.state.selfUserId}
              waiting={
                showRequest
                  ? [
                      {
                        userId: '00000000-0000-4000-8000-000000000002',
                        displayName: 'Guest with a longer display name',
                        requestedAt: new Date().toISOString(),
                      },
                    ]
                  : []
              }
            />
          </aside>
        </div>
      )}
      <h1>Actual call controller — peer {peer}</h1>
      <p>
        Connection: {room.connectionStatus}; admission: {room.state.admission}
        {';'}
        role: {room.state.role}
      </p>
      <button
        type="button"
        onClick={() =>
          run(async () => {
            await Promise.all(
              [...contexts]
                .filter((context) => context.state !== 'closed')
                .map((context) => context.resume())
            );
            await Promise.all(
              [...document.querySelectorAll('section video')].map((element) =>
                (element as HTMLVideoElement).play()
              )
            );
          })
        }
      >
        Start playback measurement
      </button>
      <button type="button" onClick={() => room.setBandwidthMode('saver')}>
        Use data saver
      </button>
      <button type="button" onClick={() => room.setBandwidthMode('auto')}>
        Use balanced bandwidth
      </button>
      <button
        type="button"
        onClick={() =>
          setDiagnostics(
            JSON.stringify(
              [...peers]
                .filter((pc) => pc.connectionState === 'connected')
                .flatMap((pc) =>
                  pc
                    .getSenders()
                    .filter((sender) => sender.track)
                    .map((sender) => ({
                      kind: sender.track?.kind,
                      encodings: sender
                        .getParameters()
                        .encodings.map(
                          ({
                            active,
                            maxBitrate,
                            maxFramerate,
                            scaleResolutionDownBy,
                          }) => ({
                            active,
                            maxBitrate,
                            maxFramerate,
                            scaleResolutionDownBy,
                          })
                        ),
                    }))
                )
            )
          )
        }
      >
        Read sender limits
      </button>
      <button type="button" onClick={() => run(room.toggleMicrophone)}>
        Toggle microphone
      </button>
      <button type="button" onClick={() => run(room.toggleCamera)}>
        Toggle camera
      </button>
      <button
        type="button"
        onClick={() =>
          run(() => room.setCameraLook({ filter: 'mono', softness: 0.3 }))
        }
      >
        Apply camera effect
      </button>
      <button
        type="button"
        onClick={() =>
          run(() => room.setCameraLook({ filter: 'none', softness: 0 }))
        }
      >
        Clear camera effect
      </button>
      <button
        type="button"
        onClick={() => {
          const receiver = [...peers]
            .reverse()
            .find(
              (pc) =>
                pc.connectionState === 'connected' &&
                pc.getSenders().every((sender) => !sender.track) &&
                pc.getReceivers().length
            );
          if (!receiver) {
            setError('No connected subscriber');
            return;
          }
          const original = receiver.getStats.bind(receiver);
          receiver.getStats = async () => {
            const stats = await original();
            return new Map(
              [...stats.entries()].map(([id, stat]) => [
                id,
                stat.type === 'inbound-rtp'
                  ? { ...stat, bytesReceived: 0 }
                  : stat,
              ])
            ) as unknown as RTCStatsReport;
          };
          setError('Simulated stalled receiver counters');
        }}
      >
        Simulate stalled receiver
      </button>
      <button type="button" onClick={room.leave}>
        Leave immediately
      </button>
      <button
        type="button"
        onClick={() =>
          void room
            .getMediaDiagnostics()
            .then((value) => setDiagnostics(JSON.stringify(value)))
        }
      >
        Read media diagnostics
      </button>
      <pre>{diagnostics}</pre>
      <button type="button" onClick={() => run(room.toggleScreenShare)}>
        Toggle screen
      </button>
      <button
        type="button"
        onClick={() => room.sendChat(`Call verification from ${peer}`)}
      >
        Send test chat
      </button>
      <button
        type="button"
        onClick={() => {
          for (const socket of sockets)
            if (socket.readyState === WebSocket.OPEN)
              socket.close(4001, 'test reconnect');
        }}
      >
        Reconnect
      </button>
      <button
        type="button"
        onClick={() => {
          for (const track of sharedStream?.getTracks() ?? []) {
            track.stop();
            track.dispatchEvent(new Event('ended'));
          }
        }}
      >
        Stop share externally
      </button>
      <button
        type="button"
        onClick={() => {
          const other = Object.values(room.state.participants).find(
            (entry) => entry.userId !== room.state.selfUserId
          );
          if (other) room.muteParticipant(other.userId, ['audio']);
        }}
      >
        Mute peer
      </button>
      <p>
        Decoded video frames: {frames}; playback: {playback}
      </p>
      <p>Local: {JSON.stringify(room.media)}</p>
      <p role="alert">{error}</p>
      <div>
        Chat: {room.state.chat.map((message) => message.body).join(' | ')}
      </div>
      {Object.values(room.state.participants)
        .filter((entry) => entry.userId !== room.state.selfUserId)
        .map((entry) => (
          <section key={entry.userId}>
            <p>
              {entry.displayName}: {JSON.stringify(entry.media)}; received audio
              energy: {energy[`${entry.userId}:audio`]?.toFixed(2) ?? 'pending'}
              ; shared audio energy:{' '}
              {energy[`${entry.userId}:screen_audio`]?.toFixed(2) ?? 'pending'}
            </p>
            <RemotePeer
              entry={entry}
              tracks={room.remoteMedia[entry.userId] ?? {}}
            />
          </section>
        ))}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <NextIntlClientProvider locale="en" messages={messages}>
      <CallCheck />
    </NextIntlClientProvider>
  </QueryClientProvider>
);
