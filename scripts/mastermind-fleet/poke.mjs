// State poke: tells the Mastermind bridge daemon that one topic changed on
// this machine, so owner clients refetch it at once instead of polling. A
// poke carries a topic and a revision only, never content or credentials.
// The publisher is a short launchd run and holds no socket, so it drops a
// small file here and the daemon (bridge.mjs) forwards the newest one.
import os from 'node:os';
import path from 'node:path';
import { readPrivateFile, writePrivateFile } from './private-files.mjs';

/** Closed set; the bridge drops anything else. */
export const POKE_TOPICS = ['state', 'usage', 'status', 'threads'];

export function pokesDir(home = os.homedir()) {
  return path.join(home, '.local/share/fleet-sync/pokes');
}

/** A well-formed poke, or null. */
export function parsePoke(value) {
  const observedAt =
    typeof value?.observedAt === 'string' ? Date.parse(value.observedAt) : NaN;
  return POKE_TOPICS.includes(value?.topic) &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    !Number.isNaN(observedAt)
    ? {
        topic: value.topic,
        revision: value.revision,
        observedAt: new Date(observedAt).toISOString(),
      }
    : null;
}

/**
 * Records that `topic` reached `revision` (a non-negative integer that only
 * grows, such as a snapshot time in milliseconds). Never throws: a missed
 * poke only delays a refresh. Returns whether the file was written.
 */
export function sendPoke(
  { topic, revision, observedAt = new Date().toISOString() },
  { dir = pokesDir() } = {}
) {
  const poke = parsePoke({ topic, revision, observedAt });
  if (!poke) return false;
  try {
    writePrivateFile(
      path.join(dir, `${poke.topic}.json`),
      `${JSON.stringify(poke)}\n`
    );
    return true;
  } catch {
    return false;
  }
}

/** The newest poke per topic currently on disk. */
export function readPokes(dir = pokesDir()) {
  const pokes = [];
  for (const topic of POKE_TOPICS) {
    try {
      const poke = parsePoke(
        JSON.parse(readPrivateFile(path.join(dir, `${topic}.json`)) ?? 'null')
      );
      if (poke?.topic === topic) pokes.push(poke);
    } catch {
      // No poke for this topic yet, or a half-written file: skip it.
    }
  }
  return pokes;
}
