import type { InventorySeasonMergePayload } from '@tuturuuu/internal-api/inventory';
import { z } from 'zod';

const schema = z.object({
  actorId: z.string().min(1),
  wsId: z.string().min(1),
  sourceName: z.string(),
  targetName: z.string(),
  payload: z.object({
    sourceId: z.guid(),
    targetId: z.guid(),
    version: z.guid(),
    descriptionPolicy: z.enum(['source', 'target']),
    rulePolicy: z.enum(['source', 'target']),
    pricePolicy: z.enum(['block', 'target']),
  }),
});
export type PendingSeasonMerge = {
  actorId: string;
  wsId: string;
  sourceName: string;
  targetName: string;
  payload: InventorySeasonMergePayload;
};
const key = (actorId: string, wsId: string) =>
  `inventory:season-merge:${encodeURIComponent(actorId)}:${encodeURIComponent(wsId)}`;
export function readPendingSeasonMerge(actorId: string, wsId: string) {
  const raw = sessionStorage.getItem(key(actorId, wsId));
  if (!raw) return null;
  const record = schema.parse(JSON.parse(raw));
  if (record.actorId !== actorId || record.wsId !== wsId)
    throw new Error('Season merge recovery scope mismatch');
  return Object.freeze({ ...record, payload: Object.freeze(record.payload) });
}
export function savePendingSeasonMerge(record: PendingSeasonMerge) {
  const existing = readPendingSeasonMerge(record.actorId, record.wsId);
  if (existing && JSON.stringify(existing) !== JSON.stringify(record))
    throw new Error('Resolve the original season merge first');
  sessionStorage.setItem(
    key(record.actorId, record.wsId),
    JSON.stringify(record)
  );
}
export function clearPendingSeasonMerge(record: PendingSeasonMerge) {
  const existing = readPendingSeasonMerge(record.actorId, record.wsId);
  if (existing && JSON.stringify(existing) === JSON.stringify(record))
    sessionStorage.removeItem(key(record.actorId, record.wsId));
}
