import { createHash } from 'node:crypto';
import path from 'node:path';
import { fleetText } from './scrub.mjs';
import { readT3Usage } from './t3-usage.mjs';

const ROUTE = '/api/v1/mastermind/fleet/usage';
const MAX_MACHINES = 12;
const BYTE_LIMIT = 92 * 1024;
const KEY = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ENVIRONMENT = /^[a-z0-9-]{1,80}$/i;

// Closed reasons for a machine whose quota or accounting was not read. Only
// these values leave the host; credentials and RPC bodies never do.
const READ_FAILURES = new Map([
  ['usage_ticket_refused', 'reader_refused'],
  ['usage_ticket_invalid', 'reader_refused'],
  ['usage_environment_mismatch', 'environment_mismatch'],
  ['usage_origin_invalid', 'config_invalid'],
  ['secret_not_a_file', 'reader_missing'],
  ['secret_file_permissions', 'reader_missing'],
  ['secret_too_short', 'reader_missing'],
  ['usage_rpc_timeout', 'unreachable'],
  ['usage_rpc_disconnected', 'unreachable'],
]);

export function usageReadFailure(error) {
  const message = error instanceof Error ? error.message : '';
  if (READ_FAILURES.has(message)) return READ_FAILURES.get(message);
  if (error?.code === 'ENOENT') return 'reader_missing';
  if (
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    error instanceof TypeError
  ) {
    // fetch reports refused connections and DNS failures as TypeError.
    return 'unreachable';
  }
  return 'read_failed';
}

function unread(machine, reason) {
  return {
    ...machine,
    quota: { kind: 'unavailable', reason },
    accounting: { kind: 'unavailable', reason },
    accounts: [],
    buckets: [],
  };
}

/** A source T3 answered without a usable reply is named as not reported. */
function withReportedReason(source) {
  return source.kind === 'unavailable' && !source.reason
    ? { ...source, reason: 'not_reported' }
    : source;
}

function configuredMachines(raw) {
  if (raw == null) return new Map();
  if (!Array.isArray(raw) || raw.length > MAX_MACHINES) {
    throw new Error('usage_machine_config_invalid');
  }
  const byId = new Map();
  for (const machine of raw) {
    if (
      typeof machine?.id !== 'string' ||
      !KEY.test(machine.id) ||
      byId.has(machine.id) ||
      typeof machine.environmentId !== 'string' ||
      !ENVIRONMENT.test(machine.environmentId) ||
      typeof machine.origin !== 'string'
    ) {
      throw new Error('usage_machine_config_invalid');
    }
    byId.set(machine.id, {
      origin: machine.origin,
      environmentId: machine.environmentId,
    });
  }
  return byId;
}

export function usageCollector({
  root,
  configs,
  readSecret,
  now,
  signal,
  collect = readT3Usage,
}) {
  const configured = configuredMachines(configs);
  if (!configured.size) return null;
  return async (fleetMachines) => {
    const annotated = await Promise.all(
      fleetMachines.slice(0, MAX_MACHINES).map(async ({ id, label }) => {
        const machine = { id, label: fleetText(label, 48) || id };
        const config = configured.get(id);
        if (!config) return unread(machine, 'not_configured');
        try {
          const result = await collect({
            ...config,
            bearer: readSecret(path.join(root, 'usage-readers', id)),
            signal,
            now,
          });
          return {
            ...machine,
            ...result,
            quota: withReportedReason(result.quota),
            accounting: withReportedReason(result.accounting),
          };
        } catch (error) {
          // Closed reason only. Neither credentials nor RPC error bodies
          // are returned or logged.
          return unread(machine, usageReadFailure(error));
        }
      })
    );

    // Match T3's physical-log deduplication. Choose one observed copy before
    // serialization so raw fingerprints and source paths stay on the host.
    const sourceOwners = new Map();
    const ranked = [...annotated].sort(
      (a, b) =>
        Number(b.accounting.kind === 'complete') -
          Number(a.accounting.kind === 'complete') ||
        (Date.parse(b.accounting.observedAt) || 0) -
          (Date.parse(a.accounting.observedAt) || 0)
    );
    for (const machine of ranked) {
      for (const id of machine.bucketSourceIds ?? []) {
        if (id && !sourceOwners.has(id)) sourceOwners.set(id, machine.id);
      }
    }
    const machines = annotated.map(({ bucketSourceIds, ...machine }) => {
      if (!bucketSourceIds) return machine;
      const buckets = machine.buckets.filter((_, index) => {
        const key = bucketSourceIds[index];
        return !key || sourceOwners.get(key) === machine.id;
      });
      if (buckets.length === machine.buckets.length) return machine;
      return {
        ...machine,
        accounting: { ...machine.accounting, kind: 'partial' },
        buckets,
      };
    });

    const snapshot = { v: 1, generatedAt: now.toISOString(), machines };
    let bytes = Buffer.byteLength(JSON.stringify(snapshot));
    // Remove oldest accounting rows first. Account identity and quotas
    // remain whole. Every trimmed machine reports partial accounting.
    while (bytes > BYTE_LIMIT) {
      const oldest = machines
        .filter((machine) => machine.buckets.length > 0)
        .sort((a, b) =>
          a.buckets.at(-1).day.localeCompare(b.buckets.at(-1).day)
        )
        .at(0);
      if (!oldest) throw new Error('usage_body_too_large');
      const removed = oldest.buckets.pop();
      bytes -= Buffer.byteLength(JSON.stringify(removed));
      if (oldest.buckets.length > 0) bytes -= 1; // Trailing array separator.
      bytes += 'partial'.length - oldest.accounting.kind.length;
      oldest.accounting.kind = 'partial';
    }
    const fingerprint = machines.map(({ quota, accounting, ...machine }) => ({
      ...machine,
      quota: [quota.kind, quota.reason],
      accounting: [accounting.kind, accounting.reason],
    }));
    return {
      path: ROUTE,
      body: JSON.stringify(snapshot),
      hash: createHash('sha256')
        .update(JSON.stringify(fingerprint))
        .digest('hex'),
    };
  };
}
