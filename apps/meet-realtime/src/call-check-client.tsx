/** Runtime verification of the actual React call controller with synthetic media. */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ParticipantTile } from '../../meet/src/features/call/components/participant-tile';
import { useMeetRoom } from '../../meet/src/features/call/hooks/use-meet-room';

const peer =
  new URL(location.href).searchParams.get('peer') === 'b' ? 'b' : 'a';
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
  return sharedStream;
};

const config = await fetch(`/token?peer=${peer}`).then((response) =>
  response.json()
);
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
  const [error, setError] = useState('');
  const [energy, setEnergy] = useState<Record<string, number>>({});
  useEffect(() => {
    const audioContexts: AudioContext[] = [];
    const timers: ReturnType<typeof setInterval>[] = [];
    for (const [id, stream] of Object.entries(room.remoteStreams)) {
      if (!stream.getAudioTracks().length) continue;
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
    return () => {
      for (const timer of timers) clearInterval(timer);
      for (const context of audioContexts) {
        contexts.delete(context);
        void context.close();
      }
    };
  }, [room.remoteStreams]);
  const run = (action: () => Promise<void>) => {
    setError('');
    void action().catch((error) => setError(String(error)));
  };
  return (
    <main>
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
      <button type="button" onClick={() => run(room.toggleMicrophone)}>
        Toggle microphone
      </button>
      <button type="button" onClick={() => run(room.toggleCamera)}>
        Toggle camera
      </button>
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
              energy: {energy[entry.userId]?.toFixed(2) ?? 'pending'}
            </p>
            <ParticipantTile
              resumePlaybackLabel="Play meeting audio"
              participant={entry}
              stream={room.remoteStreams[entry.userId]}
            />
          </section>
        ))}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<CallCheck />);
