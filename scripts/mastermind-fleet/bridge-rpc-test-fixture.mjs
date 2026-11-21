// Shared by the read-request tests: a request sealed and signed the way Web
// does it, the way Web opens an answer, and a recording stand-in for T3.
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import {
  BRIDGE_RPC_KEY_INFO,
  bridgeRpcSealContext,
  bridgeRpcSigningString,
} from '../../packages/utils/src/mastermind-store/bridge-protocol.ts';
import { handleRequest } from './bridge-rpc.mjs';
import { NOW, SECRET, uuid } from './bridge-test-fixture.mjs';

export const THREAD = 'thread:project:mcp%3Aabc:1234';
const key = (secret = SECRET) =>
  Buffer.from(
    hkdfSync('sha256', secret, Buffer.alloc(0), BRIDGE_RPC_KEY_INFO, 32)
  );

/** A read request sealed and signed the way Web does it (apps/web/.../bridge-rpc.ts). */
export function requestFrame(kind, args = {}, over = {}, secret = SECRET) {
  const base = {
    id: uuid(1),
    machineId: 'skr-m4',
    kind,
    issuedAt: NOW - 1000,
    expiresAt: NOW + 20_000,
    ...over,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  cipher.setAAD(
    Buffer.from(bridgeRpcSealContext('req', base.id, base.machineId))
  );
  const data = Buffer.concat([
    cipher.update(JSON.stringify(args), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const request = {
    ...base,
    box: { iv: iv.toString('base64url'), data: data.toString('base64url') },
  };
  return {
    v: 1,
    t: 'req',
    request,
    sig: createHmac('sha256', secret)
      .update(bridgeRpcSigningString(request))
      .digest('hex'),
  };
}

/** Opens a `res` frame the way Web does. */
export function openAnswer(frame, request, secret = SECRET) {
  const data = Buffer.from(frame.box.data, 'base64url');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(secret),
    Buffer.from(frame.box.iv, 'base64url')
  );
  decipher.setAAD(
    Buffer.from(bridgeRpcSealContext('res', request.id, request.machineId))
  );
  decipher.setAuthTag(data.subarray(data.length - 16));
  return JSON.parse(
    Buffer.concat([
      decipher.update(data.subarray(0, data.length - 16)),
      decipher.final(),
    ]).toString('utf8')
  );
}

export const deps = (tools) => {
  const calls = [];
  return {
    calls,
    secret: SECRET,
    machineId: 'skr-m4',
    now: () => NOW,
    call: async (name, args) => {
      calls.push({ name, args });
      const tool = tools[name];
      if (!tool) throw Object.assign(new Error('x'), { code: 't3_tool_error' });
      return tool(args);
    },
  };
};

export const ask = async (kind, args, tools, over) => {
  const frame = requestFrame(kind, args, over);
  const d = deps(tools);
  const res = await handleRequest(frame, d);
  return { res, calls: d.calls, answer: res && openAnswer(res, frame.request) };
};

/**
 * Reads of this machine itself, answered from `db`; counts how often it is
 * closed. `more` adds dependencies such as `scratchRoot`.
 */
export function localAsk(db, more = {}) {
  const state = { closed: 0 };
  const local = async (kind, args) => {
    const frame = requestFrame(kind, args);
    const d = {
      ...deps({}),
      ...more,
      openDatabase: () => ({
        prepare: (sql) => db.prepare(sql),
        close: () => state.closed++,
      }),
    };
    const res = await handleRequest(frame, d);
    return { answer: openAnswer(res, frame.request), calls: d.calls };
  };
  return Object.assign(local, { state });
}
