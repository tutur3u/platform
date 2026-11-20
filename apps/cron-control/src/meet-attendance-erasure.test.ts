// Attendance erasure through the processor. The SQL contract is covered by
// apps/database/scripts/meet-attendance-erasure-rooms.test.mjs.
import { expect, it } from 'vite-plus/test';
import { CRON_JOBS, DATABASE_MAINTENANCE_RPCS } from './jobs';
import {
  MEET_ATTENDANCE_ACK_RPC,
  MEET_ATTENDANCE_ADVANCE_RPC,
  MEET_ATTENDANCE_CLAIM_RPC,
  MEET_ATTENDANCE_PROBE_ROOM,
  MEET_ATTENDANCE_READY_RPC,
  MEET_ATTENDANCE_ROOM_PAGE,
  MEET_ATTENDANCE_ROOM_PAGES,
  type MeetAttendanceErasureDeps,
  runMeetAttendanceErasure,
} from './processors/meet-attendance-erasure';
import type { PrivateRpcResult } from './processors/maintenance-rpc';

const advanced = {
  state: 'open',
  advanced: 1,
  finished: 0,
  confirmed: 0,
  cancelled: 0,
  waiting: 0,
};

function roomsFor(total: number) {
  return Array.from({ length: total }, (_, index) => ({
    kind: 'workspace',
    subjectKey: 'ws',
    roomId: `ws:room-${index}`,
    generation: 1,
    keys: ['meeting'],
  }));
}

// A database stand-in that hands out each unacknowledged room once.
function harness(options: {
  rooms?: ReturnType<typeof roomsFor>;
  erase?: MeetAttendanceErasureDeps['erase'];
  open?: () => boolean;
  claimState?: string;
  ackValue?: string;
}) {
  const queue = [...(options.rooms ?? [])];
  const calls: Array<{ rpc: string; body: Record<string, unknown> }> = [];
  const erased: string[] = [];
  const deps: MeetAttendanceErasureDeps = {
    async call(rpc, body): Promise<PrivateRpcResult> {
      calls.push({ rpc, body });
      if (rpc === MEET_ATTENDANCE_ADVANCE_RPC)
        return { kind: 'ok', value: advanced };
      if (rpc === MEET_ATTENDANCE_CLAIM_RPC) {
        const page = queue.splice(0, Number(body.p_limit));
        return {
          kind: 'ok',
          value: { state: options.claimState ?? 'open', rooms: page, stuck: 0 },
        };
      }
      if (rpc === MEET_ATTENDANCE_ACK_RPC)
        return { kind: 'ok', value: options.ackValue ?? 'acked' };
      if (rpc === MEET_ATTENDANCE_READY_RPC)
        return {
          kind: 'ok',
          value: body.p_binding_erased === true ? 'ready' : 'binding',
        };
      throw new Error(`unexpected ${rpc}`);
    },
    erase:
      options.erase === undefined
        ? async (input) => {
            if (input.roomId !== MEET_ATTENDANCE_PROBE_ROOM)
              erased.push(input.roomId);
            return { acked: input.keys };
          }
        : options.erase,
    fence: async () => options.open?.() ?? true,
  };
  return { calls, deps, erased };
}

it('is a disabled, claim-fenced job on the existing ten-minute trigger', () => {
  const job = CRON_JOBS.find((entry) => entry.id === 'meet-attendance-erasure');
  expect(job).toMatchObject({
    cron: '*/10 * * * *',
    overlap: 'claim-fenced',
    workerProcessor: 'meet-attendance-erasure',
  });
  expect(DATABASE_MAINTENANCE_RPCS['meet-attendance-erasure']).toBe(
    MEET_ATTENDANCE_ADVANCE_RPC
  );
});

it('works more than 128 rooms in bounded pages and acknowledges each', async () => {
  const { calls, deps, erased } = harness({ rooms: roomsFor(300) });
  const result = await runMeetAttendanceErasure(deps);
  expect(result).toEqual({
    outcome: 'ok',
    detail: {
      claimed: 300,
      acked: 300,
      stale: 0,
      failed: 0,
      stuck: 0,
      advanced: 2,
      finished: 0,
      confirmed: 0,
      cancelled: 0,
      waiting: 0,
      ready: 1,
    },
  });
  expect(new Set(erased).size).toBe(300);
  const claims = calls.filter((call) => call.rpc === MEET_ATTENDANCE_CLAIM_RPC);
  expect(claims.map((call) => call.body.p_limit)).toEqual([
    MEET_ATTENDANCE_ROOM_PAGE,
    MEET_ATTENDANCE_ROOM_PAGE,
    MEET_ATTENDANCE_ROOM_PAGE,
  ]);
  expect(calls.slice(-2).map((call) => call.rpc)).toEqual([
    MEET_ATTENDANCE_ADVANCE_RPC,
    MEET_ATTENDANCE_READY_RPC,
  ]);
  const ack = calls.find((call) => call.rpc === MEET_ATTENDANCE_ACK_RPC);
  expect(ack?.body).toEqual({
    p_kind: 'workspace',
    p_subject_key: 'ws',
    p_room_id: 'ws:room-0',
    p_generation: 1,
    p_keys: ['meeting'],
  });
});

it('stops after the page budget and leaves the rest for the next slot', async () => {
  const total = MEET_ATTENDANCE_ROOM_PAGE * (MEET_ATTENDANCE_ROOM_PAGES + 2);
  const { deps, erased } = harness({ rooms: roomsFor(total) });
  const result = await runMeetAttendanceErasure(deps);
  expect(result.detail.claimed).toBe(
    MEET_ATTENDANCE_ROOM_PAGE * MEET_ATTENDANCE_ROOM_PAGES
  );
  expect(erased).toHaveLength(
    MEET_ATTENDANCE_ROOM_PAGE * MEET_ATTENDANCE_ROOM_PAGES
  );
});

it('does not acknowledge a room whose erase failed', async () => {
  const { calls, deps } = harness({
    rooms: roomsFor(3),
    erase: async (input) => {
      if (input.roomId === 'ws:room-1') throw new Error('room unavailable');
      if (input.roomId === 'ws:room-2') return { acked: [] };
      return { acked: [...input.keys, 'user:unrequested'] };
    },
  });
  const result = await runMeetAttendanceErasure(deps);
  expect(result.outcome).toBe('failed');
  expect(result.detail).toMatchObject({ claimed: 3, acked: 1, failed: 2 });
  const acks = calls.filter((call) => call.rpc === MEET_ATTENDANCE_ACK_RPC);
  expect(acks.map((call) => [call.body.p_room_id, call.body.p_keys])).toEqual([
    ['ws:room-0', ['meeting']],
  ]);
});

it('counts an acknowledgement for a superseded generation as stale', async () => {
  const { deps } = harness({ rooms: roomsFor(2), ackValue: 'stale' });
  const result = await runMeetAttendanceErasure(deps);
  expect(result).toMatchObject({
    outcome: 'ok',
    detail: { acked: 0, stale: 2 },
  });
});

it('erases nothing while either fence is closed or the binding is missing', async () => {
  const stopped = harness({ rooms: roomsFor(2), open: () => false });
  expect(await runMeetAttendanceErasure(stopped.deps)).toEqual({
    detail: {},
    outcome: 'stopped',
  });
  expect(stopped.calls).toEqual([]);

  const fenced = harness({ rooms: roomsFor(2), claimState: 'fenced' });
  const result = await runMeetAttendanceErasure(fenced.deps);
  expect(result.detail.fenced).toBe(1);
  expect(fenced.erased).toEqual([]);

  const unbound = harness({ rooms: roomsFor(2), erase: null });
  expect(await runMeetAttendanceErasure(unbound.deps)).toEqual({
    detail: { unbound: 1 },
    outcome: 'failed',
  });
  expect(unbound.calls).toEqual([]);
});

it('stops between pages when Cron Control stops the job', async () => {
  let checks = 0;
  const { deps, erased } = harness({
    rooms: roomsFor(MEET_ATTENDANCE_ROOM_PAGE * 2),
    open: () => {
      checks += 1;
      return checks <= 2;
    },
  });
  const result = await runMeetAttendanceErasure(deps);
  expect(result.outcome).toBe('stopped');
  expect(erased).toHaveLength(MEET_ATTENDANCE_ROOM_PAGE);
});

it('treats an unreadable claim page as an unknown outcome', async () => {
  const { deps, erased } = harness({});
  deps.call = async (rpc) =>
    rpc === MEET_ATTENDANCE_ADVANCE_RPC
      ? { kind: 'ok', value: advanced }
      : {
          kind: 'ok',
          value: { state: 'open', rooms: [{ roomId: 1 }], stuck: 0 },
        };
  expect((await runMeetAttendanceErasure(deps)).outcome).toBe('unknown');
  expect(erased).toEqual([]);
});

it('records readiness only after the binding erased the probe room', async () => {
  const ok = harness({ rooms: [] });
  expect((await runMeetAttendanceErasure(ok.deps)).detail.ready).toBe(1);
  expect(
    ok.calls.find((call) => call.rpc === MEET_ATTENDANCE_READY_RPC)?.body
  ).toEqual({ p_binding_erased: true });

  for (const erase of [
    async () => {
      throw new Error('binding missing entrypoint');
    },
    async () => ({ acked: [] as string[] }),
  ]) {
    const broken = harness({ rooms: [], erase });
    const result = await runMeetAttendanceErasure(broken.deps);
    expect(result.detail.ready).toBe(0);
    expect(
      broken.calls.find((call) => call.rpc === MEET_ATTENDANCE_READY_RPC)?.body
    ).toEqual({ p_binding_erased: false });
  }

  const fenced = harness({ rooms: [], claimState: 'fenced' });
  await runMeetAttendanceErasure(fenced.deps);
  expect(
    fenced.calls.some((call) => call.rpc === MEET_ATTENDANCE_READY_RPC)
  ).toBe(false);
});
