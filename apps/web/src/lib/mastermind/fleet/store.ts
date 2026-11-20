import { createHash } from 'node:crypto';
import type { UpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import type {
  FleetAnswerInput,
  FleetAnswerRecord,
  FleetState,
} from './contract';

export type FleetRedis = Pick<UpstashRestRedisClient, 'eval' | 'get' | 'set'>;

export const FLEET_STATE_KEY = 'mastermind:fleet:v1:state';
export const FLEET_ANSWERS_KEY = 'mastermind:fleet:v1:answers';
const NONCE_PREFIX = 'mastermind:fleet:v1:nonce:';
const STATE_TTL_SECONDS = 14 * 24 * 60 * 60;
const NONCE_TTL_SECONDS = 15 * 60;
const MAX_ANSWERS = 200;

export interface StoredFleetState {
  state: FleetState;
  etag: string;
  receivedAt: string;
}

function parseJson<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'object') return value as T;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function fleetEtag(state: FleetState) {
  // generatedAt is excluded so a heartbeat with unchanged content keeps the
  // phone's cached copy valid; receivedAt still advances for freshness.
  const { generatedAt: _generatedAt, ...content } = state;
  return `"${createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 32)}"`;
}

export async function readFleetState(redis: FleetRedis) {
  return parseJson<StoredFleetState>(await redis.get(FLEET_STATE_KEY));
}

export async function writeFleetState(
  redis: FleetRedis,
  state: FleetState,
  now = new Date()
): Promise<StoredFleetState> {
  const stored: StoredFleetState = {
    state,
    etag: fleetEtag(state),
    receivedAt: now.toISOString(),
  };
  await redis.set(FLEET_STATE_KEY, JSON.stringify(stored), {
    ex: STATE_TTL_SECONDS,
  });
  return stored;
}

/** Claims a publisher signature once; a replay inside the window is refused. */
export async function claimFleetNonce(redis: FleetRedis, signature: string) {
  const result = await redis.set(`${NONCE_PREFIX}${signature}`, '1', {
    nx: true,
    ex: NONCE_TTL_SECONDS,
  });
  return result === 'OK';
}

export async function readFleetAnswers(redis: FleetRedis) {
  return (
    parseJson<Record<string, FleetAnswerRecord>>(
      await redis.get(FLEET_ANSWERS_KEY)
    ) ?? {}
  );
}

// Atomic read-modify-write of the answers map. A retried request with the same
// Idempotency-Key returns the stored record unchanged; a new key on the same
// decision becomes the next revision, which the orchestrator picks up again.
const ANSWER_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local map = {}
if raw then map = cjson.decode(raw) end
local input = cjson.decode(ARGV[1])
local current = map[input.decisionId]
if current and current.idempotencyKey == input.idempotencyKey then
  return cjson.encode(current)
end
local revision = 1
local picked = 0
if current then
  revision = current.revision + 1
  picked = current.pickedUpRevision
end
input.revision = revision
input.pickedUpRevision = picked
map[input.decisionId] = input
local count = 0
local oldestKey = nil
local oldestAt = nil
for key, value in pairs(map) do
  count = count + 1
  if oldestAt == nil or value.answeredAt < oldestAt then
    oldestAt = value.answeredAt
    oldestKey = key
  end
end
if count > tonumber(ARGV[2]) and oldestKey then map[oldestKey] = nil end
redis.call('SET', KEYS[1], cjson.encode(map), 'EX', ARGV[3])
return cjson.encode(input)`;

export async function recordFleetAnswer(
  redis: FleetRedis,
  decisionId: string,
  input: FleetAnswerInput,
  idempotencyKey: string,
  now = new Date()
): Promise<FleetAnswerRecord> {
  const record = {
    decisionId,
    action: input.action,
    ...(input.optionId ? { optionId: input.optionId } : {}),
    ...(input.text ? { text: input.text } : {}),
    idempotencyKey,
    answeredAt: now.toISOString(),
  };
  const result = await redis.eval(
    ANSWER_SCRIPT,
    [FLEET_ANSWERS_KEY],
    [JSON.stringify(record), MAX_ANSWERS, STATE_TTL_SECONDS]
  );
  const stored = parseJson<FleetAnswerRecord>(result);
  if (!stored) throw new Error('answer not stored');
  return stored;
}

const ACK_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local map = cjson.decode(raw)
local acks = cjson.decode(ARGV[1])
local changed = 0
for _, ack in ipairs(acks) do
  local current = map[ack.decisionId]
  if current and ack.revision <= current.revision and ack.revision > current.pickedUpRevision then
    current.pickedUpRevision = ack.revision
    current.pickedUpAt = ARGV[2]
    changed = changed + 1
  end
end
if changed > 0 then redis.call('SET', KEYS[1], cjson.encode(map), 'KEEPTTL') end
return changed`;

export async function acknowledgeFleetAnswers(
  redis: FleetRedis,
  acks: { decisionId: string; revision: number }[],
  now = new Date()
) {
  if (acks.length === 0) return 0;
  const changed = await redis.eval(
    ACK_SCRIPT,
    [FLEET_ANSWERS_KEY],
    [JSON.stringify(acks), now.toISOString()]
  );
  return Number(changed) || 0;
}

/** Answers the orchestrator has not acknowledged at their current revision. */
export function pendingFleetAnswers(
  answers: Record<string, FleetAnswerRecord>
) {
  return Object.values(answers)
    .filter((answer) => answer.pickedUpRevision < answer.revision)
    .sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
}
