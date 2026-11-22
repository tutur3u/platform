import 'server-only';

import { createHash } from 'node:crypto';
import type { MastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { z } from 'zod';
import {
  type MobileIssueAlert,
  type MobileIssueBatch,
  mobileIssueAlertSchema,
} from './mobile-issues-contract';

const KEY = 'mastermind:fleet:v1:mobile-issues';
const DAY_MS = 86_400_000;
const DEDUPE_MS = 14 * DAY_MS;
const MAX_STORED = 512;
const FRESHNESS_MS = 5 * 60_000;
const SLOT_MS = 30 * 60_000;

const storedSchema = z.strictObject({
  slot: z.iso.datetime(),
  entries: z.array(mobileIssueAlertSchema).max(MAX_STORED),
});

export class InvalidMobileIssueSlot extends Error {}

function toAlert(
  candidate: MobileIssueBatch['alerts'][number],
  slot: string
): MobileIssueAlert {
  const { platform, issueId, kind, build, count } = candidate;
  const episode =
    kind === 'regression'
      ? candidate.fixBuild
      : kind === 'spike'
        ? Math.floor(Date.parse(slot) / (6 * 60 * 60_000))
        : '';
  const id = createHash('sha256')
    .update(`${platform}:${issueId}:${kind}:${episode}`)
    .digest('hex');
  return {
    platform,
    issueId,
    kind,
    build,
    count,
    id: `mobile-${id.slice(0, 32)}`,
    priority: kind === 'spike' && count >= 25 ? 'decision' : 'fyi',
    startedAt: slot,
  };
}

export async function recordMobileIssues(
  store: MastermindStore,
  batch: MobileIssueBatch,
  now = Date.now()
) {
  const slot = Date.parse(batch.slot);
  if (slot % SLOT_MS !== 0 || slot > now || now - slot > FRESHNESS_MS)
    throw new InvalidMobileIssueSlot();
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await store.get(KEY);
    const old = raw === null ? undefined : storedSchema.parse(JSON.parse(raw));
    if (old && Date.parse(old.slot) >= slot) return 0;
    const entries = new Map(
      (old?.entries ?? [])
        .filter(({ startedAt }) => now - Date.parse(startedAt) < DEDUPE_MS)
        .map((item) => [item.id, item])
    );
    let inserted = 0;
    for (const candidate of batch.alerts) {
      const alert = toAlert(candidate, batch.slot);
      const previous = entries.get(alert.id);
      if (!previous) {
        entries.set(alert.id, alert);
        inserted++;
      } else if (previous.priority === 'fyi' && alert.priority === 'decision')
        entries.set(alert.id, alert);
    }
    const retained = [...entries.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, MAX_STORED);
    if (
      await store.compareAndSet(
        KEY,
        raw,
        JSON.stringify({ slot: batch.slot, entries: retained }),
        DEDUPE_MS
      )
    )
      return inserted;
  }
  throw new Error('mobile_issue_contention');
}

export async function readMobileIssues(
  store: MastermindStore,
  now = Date.now()
) {
  try {
    const raw = await store.get(KEY, { cacheMs: 15_000 });
    if (raw === null) return [];
    return storedSchema
      .parse(JSON.parse(raw))
      .entries.filter(({ startedAt }) => now - Date.parse(startedAt) < DAY_MS)
      .sort(
        (a, b) =>
          Number(b.priority === 'decision') -
            Number(a.priority === 'decision') ||
          b.startedAt.localeCompare(a.startedAt) ||
          a.id.localeCompare(b.id)
      )
      .slice(0, 20);
  } catch {
    return null;
  }
}
