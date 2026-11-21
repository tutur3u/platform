/**
 * Fleet bridge Durable Object: the push channel between Web, the
 * orchestrator machine and the owner's clients. The machine holds one
 * hibernatable WebSocket; a reply Web stores here is pushed down it at once
 * and stays in the outbox until the machine acknowledges it, so nothing is
 * lost while the machine is away. Owner sockets receive receipts, pokes and
 * machine presence. Sets no alarms; `ping` is answered without waking it.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  BRIDGE_LIMITS,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SUBPROTOCOL,
  type BridgeErrorCode,
  type BridgeLive,
  type BridgeOwnerFrame,
  type BridgeReceipt,
  type BridgeTicketRequest,
  bridgeAckSigningString,
  bridgeMachineFrameSchema,
  type bridgeSendRequestSchema,
} from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import type { z } from 'zod';
import {
  type BridgeEngine,
  BridgeError,
  createBridgeEngine,
} from './bridge-engine';

type Failure = { ok: false; error: BridgeErrorCode };
type Attachment =
  | {
      role: 'machine';
      machineId: string;
      at: number;
      /** Frames in the current minute, and when the last replay was served. */
      windowStart?: number;
      frames?: number;
      helloAt?: number;
    }
  | { role: 'owner'; at: number; windowStart?: number; frames?: number }
  /** Replaced or fenced: its close handshake may lag, its frames never count. */
  | { role: 'retired'; at: number; windowStart?: number; frames?: number };
type ParsedSend = z.output<typeof bridgeSendRequestSchema>;
/** Each owner frame without its version; `Omit` alone would merge the union. */
type OwnerFrameBody = BridgeOwnerFrame extends infer Frame
  ? Frame extends unknown
    ? Omit<Frame, 'v'>
    : never
  : never;

const TICKET = /^[\w-]{32,128}$/u;
/** Close codes: a newer socket took over; the stop fence is set; too many frames. */
const CLOSE_REPLACED = 4001;
const CLOSE_FLOOD = 4008;
const CLOSE_STOPPED = 4003;

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));

function fromBase64Url(text: string) {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Ed25519 check of an acknowledgement under the key stored with its reply. */
async function verifyAck(
  ackKey: string,
  signature: string,
  ack: Parameters<typeof bridgeAckSigningString>[0]
) {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      fromBase64Url(ackKey),
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      fromHex(signature),
      new TextEncoder().encode(bridgeAckSigningString(ack))
    );
  } catch {
    return false;
  }
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export class FleetBridge extends DurableObject {
  private readonly engine: BridgeEngine;
  private readonly waiters = new Map<
    string,
    Set<(receipt: BridgeReceipt) => void>
  >();
  private schemaReady = false;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.engine = createBridgeEngine(ctx.storage.sql);
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong')
    );
  }

  private schema() {
    if (this.schemaReady) return;
    this.engine.ensureSchema();
    this.schemaReady = true;
  }

  /** One transaction; a refusal becomes a closed error code. */
  private attempt<T>(run: () => T): { ok: true; value: T } | Failure {
    this.schema();
    try {
      return { ok: true, value: this.ctx.storage.transactionSync(run) };
    } catch (error) {
      if (error instanceof BridgeError) return { ok: false, error: error.code };
      throw error;
    }
  }

  private attachment(socket: WebSocket) {
    return socket.deserializeAttachment() as Attachment | null;
  }

  /** Retires a socket first, so nothing it still sends is acted on. */
  private retire(socket: WebSocket, code: number, reason: string) {
    socket.serializeAttachment({
      role: 'retired',
      at: Date.now(),
    } satisfies Attachment);
    try {
      socket.close(code, reason);
    } catch {
      // Already closing.
    }
  }

  private push(socket: WebSocket, frame: string) {
    try {
      socket.send(frame);
    } catch {
      // A socket that is closing: the outbox still holds what matters.
    }
  }

  private broadcast(frame: OwnerFrameBody) {
    const text = JSON.stringify({ v: BRIDGE_PROTOCOL_VERSION, ...frame });
    for (const socket of this.ctx.getWebSockets('owner'))
      if (this.attachment(socket)?.role === 'owner') this.push(socket, text);
  }

  private machineSockets(machineId: string) {
    return this.ctx
      .getWebSockets(`m:${machineId}`)
      .filter((socket) => this.attachment(socket)?.role === 'machine');
  }

  private settle(receipt: BridgeReceipt) {
    for (const done of this.waiters.get(receipt.id) ?? []) done(receipt);
  }

  private machineStatus(machineId: string) {
    return this.liveNow().machines.find(
      (machine) => machine.machineId === machineId
    );
  }

  private liveNow(): BridgeLive {
    this.schema();
    const sockets = new Map<string, number>();
    for (const socket of this.ctx.getWebSockets()) {
      const who = this.attachment(socket);
      if (who?.role !== 'machine') continue;
      const seen =
        this.ctx.getWebSocketAutoResponseTimestamp(socket)?.getTime() ?? who.at;
      sockets.set(
        who.machineId,
        Math.max(seen, sockets.get(who.machineId) ?? 0)
      );
    }
    return {
      machines: this.engine.machines().map((machine) => ({
        ...machine,
        connected: sockets.has(machine.machineId),
        ...(sockets.has(machine.machineId)
          ? { lastSeenAt: sockets.get(machine.machineId) }
          : {}),
      })),
      pokes: this.engine.pokes(),
    };
  }

  async mintTicket(request: BridgeTicketRequest, budget: number) {
    const ticket = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const hash = await sha256Hex(ticket);
    const now = Date.now();
    const minted = this.attempt(() =>
      this.engine.mintTicket(
        {
          hash,
          role: request.role,
          ...(request.role === 'machine'
            ? { machineId: request.machineId }
            : {}),
        },
        now,
        budget
      )
    );
    return minted.ok
      ? ({ ok: true, ticket, expiresAt: minted.value } as const)
      : minted;
  }

  async send(input: ParsedSend, budget: number) {
    const now = Date.now();
    const { envelope } = input;
    const frame = JSON.stringify({
      v: BRIDGE_PROTOCOL_VERSION,
      t: 'reply',
      envelope,
      sig: input.sig,
    });
    const stored = this.attempt(() =>
      this.engine.enqueue(
        {
          id: envelope.id,
          machineId: envelope.machineId,
          threadId: envelope.threadId,
          ...(envelope.environmentId
            ? { environmentId: envelope.environmentId }
            : {}),
          actorId: envelope.actorId,
          textDigest: envelope.textDigest,
          ackKey: input.ackKey,
          expiresAt: envelope.expiresAt,
          frame,
        },
        now,
        budget
      )
    );
    if (!stored.ok) return stored;
    const { replayed } = stored.value;
    let receipt = this.engine.receipt(envelope.id, now) ?? stored.value.receipt;
    if (receipt.state !== 'sent')
      return { ok: true, receipt, replayed } as const;

    const sockets = this.machineSockets(envelope.machineId);
    if (!replayed) {
      // A replay never pushes again: the first push is in flight, or the
      // machine collects it from the outbox when it reconnects.
      for (const socket of sockets) this.push(socket, frame);
      this.broadcast({ t: 'receipt', receipt });
    }
    if (sockets.length > 0 && input.waitMs > 0)
      receipt = await this.waitFor(envelope.id, input.waitMs, receipt);
    return { ok: true, receipt, replayed } as const;
  }

  private waitFor(id: string, waitMs: number, fallback: BridgeReceipt) {
    return new Promise<BridgeReceipt>((resolve) => {
      const set = this.waiters.get(id) ?? new Set();
      this.waiters.set(id, set);
      const done = (receipt: BridgeReceipt) => {
        clearTimeout(timer);
        set.delete(done);
        if (set.size === 0) this.waiters.delete(id);
        resolve(receipt);
      };
      const timer = setTimeout(
        () => done(this.engine.receipt(id, Date.now()) ?? fallback),
        waitMs
      );
      set.add(done);
    });
  }

  async receipt(id: string) {
    this.schema();
    return this.engine.receipt(id, Date.now());
  }

  async live() {
    return this.liveNow();
  }

  async setFence(stopped: boolean) {
    this.schema();
    this.engine.setStopped(stopped);
    if (stopped)
      for (const socket of this.ctx.getWebSockets())
        this.retire(socket, CLOSE_STOPPED, 'stopped');
    return this.engine.stopped();
  }

  async status(budget: number) {
    this.schema();
    return {
      ...this.engine.status(Date.now(), budget),
      sockets: this.ctx.getWebSockets().length,
    };
  }

  /** WebSocket upgrade only: `Sec-WebSocket-Protocol: mm-bridge.v1, <ticket>`. */
  async fetch(request: Request) {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return new Response(null, { status: 426 });
    const offered = (request.headers.get('sec-websocket-protocol') ?? '')
      .split(',')
      .map((entry) => entry.trim());
    const ticket = offered[1] ?? '';
    if (
      offered.length !== 2 ||
      offered[0] !== BRIDGE_SUBPROTOCOL ||
      !TICKET.test(ticket)
    )
      return new Response(null, { status: 401 });
    const hash = await sha256Hex(ticket);
    const now = Date.now();
    const admitted = this.attempt(() => this.engine.redeemTicket(hash, now));
    if (!admitted.ok || !admitted.value)
      return new Response(null, { status: 401 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    if (admitted.value.role === 'machine') {
      const { machineId } = admitted.value;
      // One socket per machine: the newest wins.
      for (const old of this.ctx.getWebSockets(`m:${machineId}`))
        this.retire(old, CLOSE_REPLACED, 'replaced');
      this.ctx.acceptWebSocket(server, [`m:${machineId}`]);
      server.serializeAttachment({
        role: 'machine',
        machineId,
        at: now,
      } satisfies Attachment);
      this.attempt(() => this.engine.machineConnected(machineId, now));
      const machine = this.machineStatus(machineId);
      if (machine) this.broadcast({ t: 'machine', machine });
    } else {
      const owners = this.ctx
        .getWebSockets('owner')
        .filter((socket) => this.attachment(socket)?.role === 'owner')
        .map((socket) => ({ socket, at: this.attachment(socket)?.at ?? 0 }))
        .sort((a, b) => a.at - b.at);
      while (owners.length >= BRIDGE_LIMITS.maxOwnerSockets) {
        const oldest = owners.shift();
        if (oldest) this.retire(oldest.socket, CLOSE_REPLACED, 'replaced');
      }
      this.ctx.acceptWebSocket(server, ['owner']);
      server.serializeAttachment({
        role: 'owner',
        at: now,
      } satisfies Attachment);
    }
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'sec-websocket-protocol': BRIDGE_SUBPROTOCOL },
    });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const who = this.attachment(socket);
    if (!who || who.role === 'retired') return;
    const now = Date.now();
    // Every message wakes this object, whatever it contains, so each one is
    // counted before it is looked at and a socket that floods is retired.
    const fresh = now - (who.windowStart ?? 0) >= 60_000;
    const meter = {
      ...who,
      windowStart: fresh ? now : who.windowStart,
      frames: (fresh ? 0 : (who.frames ?? 0)) + 1,
    };
    const limit =
      who.role === 'machine'
        ? BRIDGE_LIMITS.machineFramesPerMinute
        : BRIDGE_LIMITS.ownerFramesPerMinute;
    if (meter.frames > limit) {
      this.retire(socket, CLOSE_FLOOD, 'flood');
      if (
        who.role === 'machine' &&
        this.machineSockets(who.machineId).length === 0
      ) {
        this.schema();
        this.attempt(() => this.engine.machineDisconnected(who.machineId, now));
      }
      return;
    }
    socket.serializeAttachment(meter satisfies Attachment);
    // Owner sockets only listen; machines speak the closed frame set.
    if (
      meter.role !== 'machine' ||
      typeof message !== 'string' ||
      message.length > BRIDGE_LIMITS.maxFrameBytes
    )
      return;
    let json: unknown;
    try {
      json = JSON.parse(message);
    } catch {
      return;
    }
    const parsed = bridgeMachineFrameSchema.safeParse(json);
    if (!parsed.success) return;
    const frame = parsed.data;
    const { machineId } = meter;
    this.schema();
    const budget = bridgeBudget(
      (this.env as { MASTERMIND_BRIDGE_DAILY_OPS?: string })
        .MASTERMIND_BRIDGE_DAILY_OPS
    );
    if (frame.t === 'hello') {
      // An outbox replay is work: at most one per interval, and charged.
      const due =
        now - (meter.helloAt ?? 0) >= BRIDGE_LIMITS.helloMinIntervalMs;
      if (!due || budget === null) return;
      socket.serializeAttachment({
        ...meter,
        helloAt: now,
      } satisfies Attachment);
      const charged = this.attempt(() => this.engine.chargeFrame(now, budget));
      if (!charged.ok) return;
      for (const pending of this.engine.pending(machineId, now))
        this.push(socket, pending);
      return;
    }
    if (frame.t === 'ack') {
      // Only the machine holds the key this reply's acknowledgement must
      // verify under. A forged one is dropped and the reply stays pending.
      const context = this.engine.ackContext(frame.id, machineId);
      if (
        !context ||
        !(await verifyAck(context.ackKey, frame.sig, {
          id: frame.id,
          machineId,
          state: frame.state,
          ...(frame.delivery ? { delivery: frame.delivery } : {}),
          ...(frame.code ? { code: frame.code } : {}),
          textDigest: context.textDigest,
        }))
      )
        return;
      const settled = this.attempt(() => {
        // Never refused (the delivery already happened), but it counts.
        this.engine.countFrame(now);
        return this.engine.ack(
          {
            id: frame.id,
            machineId,
            state: frame.state,
            ...(frame.delivery ? { delivery: frame.delivery } : {}),
            ...(frame.code ? { code: frame.code } : {}),
            sig: frame.sig,
          },
          now
        );
      });
      if (!settled.ok || !settled.value) return;
      this.settle(settled.value.receipt);
      if (settled.value.changed)
        this.broadcast({ t: 'receipt', receipt: settled.value.receipt });
      return;
    }
    if (budget === null) return;
    const poke = {
      machineId,
      topic: frame.topic,
      revision: frame.revision,
      observedAt: frame.observedAt,
    };
    const moved = this.attempt(() => this.engine.poke(poke, now, budget));
    if (moved.ok && moved.value) this.broadcast({ t: 'poke', poke });
  }

  async webSocketClose(socket: WebSocket) {
    this.left(socket);
  }

  async webSocketError(socket: WebSocket) {
    this.left(socket);
  }

  private left(socket: WebSocket) {
    const who = this.attachment(socket);
    if (who?.role !== 'machine') return;
    const others = this.machineSockets(who.machineId).filter(
      (other) => other !== socket
    );
    if (others.length > 0) return;
    const now = Date.now();
    this.attempt(() => this.engine.machineDisconnected(who.machineId, now));
    const machine = this.machineStatus(who.machineId);
    if (machine)
      this.broadcast({
        t: 'machine',
        machine: { ...machine, connected: false },
      });
  }
}

const DEFAULT_DAILY_OPS = 20_000;
const MAX_DAILY_OPS = 1_000_000;

/** Billable bridge operations per UTC day; null when misconfigured. */
export function bridgeBudget(raw: string | undefined) {
  if (!raw?.trim()) return DEFAULT_DAILY_OPS;
  if (!/^\d{1,7}$/u.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return value > 0 && value <= MAX_DAILY_OPS ? value : null;
}
