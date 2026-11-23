import { hashSubject, seal, sign, unseal, verifySigned } from './crypto';
import { toBase64 } from './encoding';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  carveCutout,
  cutPiece,
  PIECE_SIZE,
  type PieceShape,
  renderBackground,
} from './image';
import {
  assessTrajectory,
  type InputMode,
  type TrajectoryPoint,
} from './motion';
import { encodePng } from './png';
import { createRandom, seedFromCrypto } from './random';

export const CHALLENGE_TTL_MS = 120_000;
export const PASS_TTL_MS = 120_000;
export const MAX_ATTEMPTS = 3;

/** Atomic counter with a time-to-live, e.g. the abuse-guard store. */
export type HumanCheckStore = {
  incr: (key: string, ttlMs: number) => Promise<number>;
};

/** What the browser receives: images and an opaque sealed token only. */
export type JigsawChallenge = {
  token: string;
  background: string;
  piece: string;
  pieceY: number;
  width: number;
  height: number;
  pieceSize: number;
  expiresAt: number;
};

type SealedState = {
  v: 1;
  cid: string;
  sx: number;
  scope: string;
  sub: string;
  exp: number;
  tol: number;
  max: number;
};

type PassPayload = {
  v: 1;
  jti: string;
  cid: string;
  scope: string;
  sub: string;
  exp: number;
};

const SHAPES: PieceShape[] = ['top-right', 'bottom-right', 'top-left'];

const dataUrl = async (
  width: number,
  height: number,
  rgba: Uint8ClampedArray
) => `data:image/png;base64,${toBase64(await encodePng(width, height, rgba))}`;

/**
 * Renders one challenge. `level` 1 adds a decoy, tightens tolerance and
 * allows two placements, after repeated puzzles from the same subject.
 */
export async function createJigsawChallenge(input: {
  secret: string;
  scope: string;
  subject: string;
  level?: 0 | 1;
  now?: number;
  /** Texture seed (tests only). */
  seed?: number;
  /** Geometry seed (tests only); kept apart so the texture never reveals it. */
  geometrySeed?: number;
}): Promise<JigsawChallenge> {
  const now = input.now ?? Date.now();
  const level = input.level ?? 0;
  const texture = createRandom(input.seed ?? seedFromCrypto());
  const geometry = createRandom(input.geometrySeed ?? seedFromCrypto());
  const background = renderBackground(texture);
  const shape = geometry.pick(SHAPES);
  const minX = PIECE_SIZE + 30;
  const maxX = CANVAS_WIDTH - PIECE_SIZE - 6;
  const sx = geometry.int(minX, maxX);
  const sy = geometry.int(4, CANVAS_HEIGHT - PIECE_SIZE - 4);
  const piece = cutPiece(background, shape, sx, sy);
  const board = new Uint8ClampedArray(background);
  // Decoys share the piece's shape and darkness, so outline matching alone
  // cannot pick the real slot.
  const darkness = () => 0.45 + geometry.next() * 0.12;
  const decoys = level === 1 ? 3 : 2;
  for (let placed = 0, tries = 0; placed < decoys && tries < 40; tries += 1) {
    const x = geometry.int(PIECE_SIZE + 10, maxX);
    if (Math.abs(x - sx) < PIECE_SIZE + 4) continue;
    const y = geometry.int(4, CANVAS_HEIGHT - PIECE_SIZE - 4);
    carveCutout(board, shape, x, y, darkness());
    placed += 1;
  }
  carveCutout(board, shape, sx, sy, darkness());
  const expiresAt = now + CHALLENGE_TTL_MS;
  const state: SealedState = {
    v: 1,
    cid: crypto.randomUUID(),
    sx,
    scope: input.scope,
    sub: await hashSubject(input.secret, input.subject),
    exp: expiresAt,
    tol: level === 1 ? 4 : 6,
    max: level === 1 ? 2 : MAX_ATTEMPTS,
  };
  return {
    token: await seal(input.secret, state),
    background: await dataUrl(CANVAS_WIDTH, CANVAS_HEIGHT, board),
    piece: await dataUrl(PIECE_SIZE, PIECE_SIZE, piece),
    pieceY: sy,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    pieceSize: PIECE_SIZE,
    expiresAt,
  };
}

export type JigsawVerdict =
  | { ok: true; passToken: string; challengeId: string; expiresAt: number }
  | {
      ok: false;
      reason: 'invalid' | 'expired' | 'attempts' | 'position' | 'motion';
      /** False when the guest needs a new challenge. */
      retry: boolean;
      challengeId?: string;
    };

/**
 * Checks one placement. A challenge allows `MAX_ATTEMPTS` placements and
 * issues at most one pass token.
 */
export async function verifyJigsawAttempt(input: {
  secret: string;
  store: HumanCheckStore;
  token: string;
  scope: string;
  subject: string;
  x: number;
  mode: InputMode;
  trajectory: TrajectoryPoint[];
  now?: number;
}): Promise<JigsawVerdict> {
  const now = input.now ?? Date.now();
  const state = await unseal<SealedState>(input.secret, input.token);
  if (
    !state ||
    state.v !== 1 ||
    state.scope !== input.scope ||
    state.sub !== (await hashSubject(input.secret, input.subject))
  )
    return { ok: false, reason: 'invalid', retry: false };
  const cid = state.cid;
  if (state.exp <= now)
    return { ok: false, reason: 'expired', retry: false, challengeId: cid };
  const ttl = state.exp - now;
  const max = Math.min(MAX_ATTEMPTS, state.max ?? MAX_ATTEMPTS);
  const attempt = await input.store.incr(`hc:att:${cid}`, ttl);
  if (attempt > max)
    return { ok: false, reason: 'attempts', retry: false, challengeId: cid };
  const retry = attempt < max;
  if (!Number.isFinite(input.x) || Math.abs(input.x - state.sx) > state.tol)
    return { ok: false, reason: 'position', retry, challengeId: cid };
  if (!assessTrajectory(input.mode, input.trajectory, input.x).ok)
    return { ok: false, reason: 'motion', retry, challengeId: cid };
  if ((await input.store.incr(`hc:done:${cid}`, ttl)) !== 1)
    return { ok: false, reason: 'attempts', retry: false, challengeId: cid };
  const expiresAt = now + PASS_TTL_MS;
  const pass: PassPayload = {
    v: 1,
    jti: crypto.randomUUID(),
    cid,
    scope: state.scope,
    sub: state.sub,
    exp: expiresAt,
  };
  return {
    ok: true,
    passToken: await sign(input.secret, pass),
    challengeId: cid,
    expiresAt,
  };
}

/** Accepts a pass token once, for the scope and subject it was issued to. */
export async function redeemPassToken(input: {
  secret: string;
  store: HumanCheckStore;
  token: string;
  scope: string;
  subject: string;
  now?: number;
}): Promise<{ ok: true; jti: string; challengeId: string } | { ok: false }> {
  const now = input.now ?? Date.now();
  const pass = await verifySigned<PassPayload>(input.secret, input.token);
  if (
    !pass ||
    pass.v !== 1 ||
    pass.scope !== input.scope ||
    pass.exp <= now ||
    pass.sub !== (await hashSubject(input.secret, input.subject))
  )
    return { ok: false };
  if ((await input.store.incr(`hc:pass:${pass.jti}`, pass.exp - now)) !== 1)
    return { ok: false };
  return { ok: true, jti: pass.jti, challengeId: pass.cid };
}
