import type {
  GuardResult,
  ParsedGuardCommand,
} from '@tuturuuu/utils/abuse-guard/protocol';
import { z } from 'zod';

type IntegrityOperation = Extract<
  ParsedGuardCommand,
  { op: 'integrity.atomic' }
>;
type IntegrityResult = Extract<
  GuardResult,
  { op: 'integrity.atomic' }
>['value'];

type Store = {
  read(key: string, now: number): { v: string; exp: number } | null;
  write(key: string, value: string, expiresAt: number): void;
  remove(key: string): void;
  invalid(message: string): never;
};

const registrationTtlMs = 90 * 24 * 60 * 60 * 1000;
const indexSchema = z
  .array(z.object({ key: z.string(), owner: z.string() }))
  .max(8);
const keySchema = z.looseObject({ counter: z.number().int().nonnegative() });

export function applyNativeIntegrity(
  { command, keys }: IntegrityOperation,
  now: number,
  store: Store
): IntegrityResult {
  const key = (index: number) =>
    keys[index] ?? store.invalid('Native integrity operation key is missing');
  const first = key(0);
  const read = (name: string) => store.read(name, now);
  const write = (name: string, value: string, ttlMs: number) =>
    store.write(name, value, now + ttlMs);
  const count = (name: string) => {
    const value = Number(read(name)?.v ?? '0');
    if (!Number.isSafeInteger(value) || value < 0)
      return store.invalid('Invalid native integrity counter');
    return value;
  };
  const increment = (name: string, ttlMs: number) => {
    const old = read(name);
    const next = count(name) + 1;
    store.write(name, String(next), old?.exp ?? now + ttlMs);
    return next;
  };
  const index = (name: string) =>
    indexSchema.parse(JSON.parse(read(name)?.v ?? '[]'));

  switch (command.action) {
    case 'issue': {
      const perHour = key(1);
      const nonce = key(2);
      if (increment(first, command.windowSeconds * 1000) > command.limit)
        return false;
      if (increment(perHour, 3_600_000) > 120 || read(nonce)) return false;
      write(nonce, command.value, command.ttlMs);
      return true;
    }
    case 'consume': {
      const row = read(first);
      if (row) store.remove(first);
      return row?.v ?? null;
    }
    case 'read-key':
      return read(first)?.v ?? null;
    case 'register': {
      const indexKey = key(1);
      const ownerKey = key(2);
      const actor = key(3);
      const owner = read(ownerKey);
      if (owner && owner.v !== actor) return false;
      const entries = index(indexKey).filter((entry) => read(entry.key));
      if (entries.length >= 8 || read(first)) return false;
      const record = keySchema.parse(JSON.parse(command.value));
      if (record.counter !== 0) return false;
      write(first, command.value, registrationTtlMs);
      write(ownerKey, actor, registrationTtlMs);
      write(
        indexKey,
        JSON.stringify([...entries, { key: first, owner: ownerKey }]),
        registrationTtlMs
      );
      return true;
    }
    case 'advance': {
      const row = read(first);
      if (!row || command.next <= command.expected) return false;
      const record = keySchema.parse(JSON.parse(row.v));
      if (record.counter !== command.expected) return false;
      store.write(
        first,
        JSON.stringify({ ...record, counter: command.next }),
        row.exp
      );
      return true;
    }
    case 'capability': {
      const play = read(key(1));
      if (play) {
        if (play.v !== '1') return store.invalid('Invalid native capability');
        return true;
      }
      return index(first).some((entry) => read(entry.key));
    }
    case 'mark-play':
      write(first, '1', registrationTtlMs);
      return true;
    case 'revoke': {
      const play = key(1);
      const actor = key(2);
      const entries = index(first);
      for (const entry of entries) {
        if (read(entry.key) && read(entry.owner)?.v === actor)
          store.remove(entry.owner);
        store.remove(entry.key);
      }
      const revoked = entries.length + Number(Boolean(read(play)));
      store.remove(first);
      store.remove(play);
      return revoked;
    }
    case 'reserve-provider': {
      const day = key(1);
      const actorDay = key(2);
      const alert = key(3);
      const used = count(day);
      const actor = count(actorDay);
      if (
        read(first)?.v === '1' ||
        used >= command.limit ||
        actor >= command.actorLimit
      )
        return { reserved: false, used, actor, warning: false };
      const ttlMs = command.ttlSeconds * 1000;
      write(day, String(used + 1), ttlMs);
      write(actorDay, String(actor + 1), ttlMs);
      const warn = used + 1 >= command.warningAt && !read(alert);
      if (warn) write(alert, '1', ttlMs);
      return {
        reserved: true,
        used: used + 1,
        actor: actor + 1,
        warning: warn,
      };
    }
  }
}
