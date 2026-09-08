import { expect, it } from 'vitest';
import { readPeerDiagnostics } from './media-diagnostics';

it('reports media counters without leaking raw WebRTC identifiers or addresses', async () => {
  const pc = {
    connectionState: 'connected',
    iceConnectionState: 'connected',
    signalingState: 'stable',
    getStats: async () =>
      new Map([
        [
          'out',
          {
            type: 'outbound-rtp',
            kind: 'audio',
            packetsSent: 42,
            bytesSent: 500,
            id: 'private-track-id',
          },
        ],
        [
          'in',
          {
            type: 'inbound-rtp',
            kind: 'video',
            packetsReceived: 20,
            bytesReceived: 800,
            framesDecoded: 3,
          },
        ],
        [
          'pair',
          {
            type: 'candidate-pair',
            state: 'succeeded',
            nominated: true,
            currentRoundTripTime: 0.0234,
            remoteCandidateId: 'private-candidate-id',
          },
        ],
        ['candidate', { type: 'local-candidate', address: 'private-address' }],
      ]),
    getReceivers: () => [
      {
        track: {
          kind: 'video',
          readyState: 'live',
          muted: false,
          enabled: true,
          id: 'private-track-id',
        },
      },
    ],
  } as unknown as RTCPeerConnection;
  const result = await readPeerDiagnostics(pc);
  expect(result.streams).toEqual([
    {
      direction: 'sent',
      kind: 'audio',
      packets: 42,
      bytes: 500,
      framesDecoded: 0,
    },
    {
      direction: 'received',
      kind: 'video',
      packets: 20,
      bytes: 800,
      framesDecoded: 3,
    },
  ]);
  expect(result.roundTripMs).toBe(23);
  expect(JSON.stringify(result)).not.toContain('private-');
});

it('distinguishes no media connection from unavailable statistics', async () => {
  expect(await readPeerDiagnostics(null)).toMatchObject({
    state: 'not_started',
    statsUnavailable: false,
  });
  const pc = {
    connectionState: 'closed',
    getStats: async () => {
      throw new Error('closed');
    },
  } as unknown as RTCPeerConnection;
  expect(await readPeerDiagnostics(pc)).toMatchObject({
    state: 'closed',
    statsUnavailable: true,
  });
});

it('counts cumulative bytes once across refreshes and connection replacement', async () => {
  const { createMediaDiagnosticsReader } = await import('./media-diagnostics');
  let bytes = 100;
  const peer = () =>
    ({
      connectionState: 'connected',
      iceConnectionState: 'connected',
      signalingState: 'stable',
      getReceivers: () => [],
      getStats: async () =>
        new Map([
          [
            'inbound',
            {
              id: 'inbound',
              type: 'inbound-rtp',
              kind: 'video',
              bytesReceived: bytes,
            },
          ],
        ]),
    }) as unknown as RTCPeerConnection;
  const read = createMediaDiagnosticsReader(),
    first = peer();
  expect((await read('open', 1, null, first)).receivedBytesTotal).toBe(100);
  expect((await read('open', 1, null, first)).receivedBytesTotal).toBe(100);
  bytes = 150;
  expect((await read('open', 1, null, first)).receivedBytesTotal).toBe(150);
  bytes = 20;
  expect((await read('open', 1, null, peer())).receivedBytesTotal).toBe(170);
});
