import { createHash } from 'node:crypto';
import path from 'node:path';
import { fleetText } from './scrub.mjs';
import { readT3Usage } from './t3-usage.mjs';

const ROUTE = '/api/v1/mastermind/fleet/usage';
const MAX_MACHINES = 12;
const BYTE_LIMIT = 92 * 1024;
const KEY = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ENVIRONMENT = /^[a-z0-9-]{1,80}$/i;

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
        if (config) {
          try {
            const result = await collect({
              ...config,
              bearer: readSecret(path.join(root, 'usage-readers', id)),
              signal,
              now,
            });
            return { ...machine, ...result };
          } catch {
            // Closed status only. Neither credentials nor RPC error bodies
            // are returned or logged.
          }
        }
        return {
          ...machine,
          quota: { kind: 'unavailable' },
          accounting: { kind: 'unavailable' },
          accounts: [],
          buckets: [],
        };
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
    const body = JSON.stringify(snapshot);
    let bytes = Buffer.byteLength(body);
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
      bytes -= Buffer.byteLength(JSON.stringify(oldest.buckets.pop()));
      oldest.accounting.kind = 'partial';
      body = JSON.stringify(snapshot);
    }
    const fingerprint = machines.map(({ quota, accounting, ...machine }) => ({
      ...machine,
      quota: quota.kind,
      accounting: accounting.kind,
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
