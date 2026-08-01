/**
 * Browser half of the media check. Imports the real client modules from
 * `apps/meet` so this exercises shipped code, not a reimplementation.
 */
import {
  type CallState,
  INITIAL_CALL_STATE,
  reduceCallState,
  remoteTrackKey,
} from '../../meet/src/features/call/lib/call-state';
import { planRemoteSubscriptions } from '../../meet/src/features/call/lib/negotiation';
import { MeetSignaling } from '../../meet/src/features/call/lib/signaling';

const lines: string[] = [];
const resultEl = document.getElementById('result');
const videoEl = document.getElementById('remote') as HTMLVideoElement | null;

function log(text: string, status?: 'pass' | 'fail') {
  lines.push(status ? `${status.toUpperCase()}: ${text}` : text);
  if (resultEl) {
    resultEl.innerHTML = lines
      .map((line) =>
        line.startsWith('PASS')
          ? `<span class="pass">${line}</span>`
          : line.startsWith('FAIL')
            ? `<span class="fail">${line}</span>`
            : line
      )
      .join('\n');
  }
}

function verdict(text: string) {
  document.title = `media check: ${text}`;
}

/** A moving canvas so the encoder always has fresh frames to send. */
function syntheticVideoTrack() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  let frame = 0;

  setInterval(() => {
    if (!ctx) return;
    frame += 1;
    ctx.fillStyle = `hsl(${frame % 360} 80% 50%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.font = '32px monospace';
    ctx.fillText(String(frame), 20, 120);
  }, 100);

  return canvas.captureStream(10).getVideoTracks()[0] as MediaStreamTrack;
}

/** An oscillator, so audio needs no microphone permission either. */
function syntheticAudioTrack() {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const destination = context.createMediaStreamDestination();
  oscillator.frequency.value = 440;
  oscillator.connect(destination);
  oscillator.start();
  return destination.stream.getAudioTracks()[0] as MediaStreamTrack;
}

const PEER_CONFIG: RTCConfiguration = {
  bundlePolicy: 'max-bundle',
  iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
};

async function main() {
  const peer =
    new URLSearchParams(location.search).get('peer') === 'b' ? 'b' : 'a';
  const whoEl = document.getElementById('who');
  if (whoEl) whoEl.textContent = `peer ${peer.toUpperCase()}`;

  const config = await fetch(`/token?peer=${peer}`).then((r) => r.json());
  let state: CallState = INITIAL_CALL_STATE;
  const subscribed = new Set<string>();
  let inboundTracks = 0;

  const signaling = new MeetSignaling({
    onMessage: (message) => {
      state = reduceCallState(state, message);
      if (message.type === 'error') log(`room error: ${message.error}`);
    },
    onStatusChange: (status) => log(`signaling ${status}`),
    resolveUrl: () =>
      `${config.roomUrl}?token=${encodeURIComponent(config.token)}`,
  });
  signaling.connect();

  await new Promise<void>((resolve) => {
    const wait = () => (signaling.isOpen ? resolve() : setTimeout(wait, 50));
    wait();
  });
  log('connected to room server', 'pass');

  // --- publish -----------------------------------------------------------
  const publishPc = new RTCPeerConnection(PEER_CONFIG);
  const publishSession = await signaling.request<{ sessionId?: string }>({
    type: 'sfu.session.create',
  });
  if (!publishSession?.sessionId) {
    log('could not create publish session', 'fail');
    verdict('FAILED');
    return;
  }
  log(`publish session ${publishSession.sessionId.slice(0, 8)}…`, 'pass');

  const added = [
    { name: `${config.selfUserId}-audio`, source: syntheticAudioTrack() },
    { name: `${config.selfUserId}-video`, source: syntheticVideoTrack() },
  ].map(({ name, source }) => ({
    name,
    transceiver: publishPc.addTransceiver(source, { direction: 'sendonly' }),
  }));

  const offer = await publishPc.createOffer();
  // `mid` is only assigned once the local description is applied; reading it
  // before this line is what produced `406 Missing mid in track`.
  await publishPc.setLocalDescription(offer);

  const publishAnswer = await signaling.request<{
    sessionDescription?: RTCSessionDescriptionInit;
  }>({
    sessionDescription: { sdp: offer.sdp ?? '', type: 'offer' },
    sessionId: publishSession.sessionId,
    tracks: added.map(({ name, transceiver }) => ({
      location: 'local',
      mid: transceiver.mid ?? undefined,
      trackName: name,
    })),
    type: 'sfu.tracks.publish',
  });

  if (!publishAnswer?.sessionDescription) {
    log('SFU returned no answer for publish', 'fail');
    verdict('FAILED');
    return;
  }
  await publishPc.setRemoteDescription(publishAnswer.sessionDescription);
  log('published audio + video to Cloudflare', 'pass');

  // --- subscribe ---------------------------------------------------------
  const subscribePc = new RTCPeerConnection(PEER_CONFIG);
  subscribePc.addEventListener('track', (event) => {
    inboundTracks += 1;
    log(`inbound ${event.track.kind} track received`, 'pass');
    if (videoEl && event.streams[0]) videoEl.srcObject = event.streams[0];
  });

  const subscribeSession = await signaling.request<{ sessionId?: string }>({
    type: 'sfu.session.create',
  });
  if (!subscribeSession?.sessionId) {
    log('could not create subscribe session', 'fail');
    verdict('FAILED');
    return;
  }
  log(`subscribe session ${subscribeSession.sessionId.slice(0, 8)}…`, 'pass');

  log('waiting for the other peer to publish…');

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const pending = planRemoteSubscriptions(
      state.remoteTracks,
      subscribed,
      config.selfUserId
    );

    if (pending.length) {
      const answer = await signaling.request<{
        sessionDescription?: RTCSessionDescriptionInit;
      }>({
        sessionId: subscribeSession.sessionId,
        tracks: pending,
        type: 'sfu.tracks.subscribe',
      });

      if (answer?.sessionDescription) {
        await subscribePc.setRemoteDescription(answer.sessionDescription);
        const localAnswer = await subscribePc.createAnswer();
        await subscribePc.setLocalDescription(localAnswer);
        await signaling.request({
          sessionDescription: { sdp: localAnswer.sdp ?? '', type: 'answer' },
          sessionId: subscribeSession.sessionId,
          type: 'sfu.renegotiate',
        });
        log(`subscribed to ${pending.length} remote track(s)`, 'pass');
      }

      for (const track of Object.values(state.remoteTracks)) {
        subscribed.add(remoteTrackKey(track));
      }
    }

    if (inboundTracks >= 2) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (inboundTracks < 2) {
    log(`only ${inboundTracks} inbound track(s) after 60s`, 'fail');
    verdict('FAILED');
    return;
  }

  // --- prove bytes actually moved ---------------------------------------
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const stats = await subscribePc.getStats();
  let bytesReceived = 0;
  let framesDecoded = 0;
  stats.forEach((report) => {
    if (report.type === 'inbound-rtp') {
      bytesReceived +=
        (report as { bytesReceived?: number }).bytesReceived ?? 0;
      framesDecoded +=
        (report as { framesDecoded?: number }).framesDecoded ?? 0;
    }
  });

  log(`bytesReceived=${bytesReceived} framesDecoded=${framesDecoded}`);
  const flowing = bytesReceived > 0 && framesDecoded > 0;
  log(
    flowing
      ? 'media is flowing through Cloudflare Realtime'
      : 'tracks negotiated but no media arrived',
    flowing ? 'pass' : 'fail'
  );
  verdict(flowing ? 'PASSED' : 'FAILED');
}

main().catch((error) => {
  log(String(error), 'fail');
  verdict('FAILED');
});
