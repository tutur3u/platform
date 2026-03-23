import {
  batchUpsert,
  createMigrationResponse,
  requireDevMode,
} from '../batch-upsert';

function normalizeMonthlyReportsPayload(data: unknown): unknown[] {
  if (!Array.isArray(data)) return [];

  const dedupedByCompositeKey = new Map<string, Record<string, unknown>>();

  for (const row of data) {
    if (!row || typeof row !== 'object') continue;

    const record = row as Record<string, unknown>;
    const userId = record.user_id;
    const groupId = record.group_id;
    const title = record.title;

    // Keep payload aligned with conflict target and avoid PK collisions on legacy IDs.
    const { id: _id, ...withoutId } = record;
    const normalized = withoutId as Record<string, unknown>;

    if (
      typeof userId === 'string' &&
      typeof groupId === 'string' &&
      typeof title === 'string'
    ) {
      dedupedByCompositeKey.set(`${userId}::${groupId}::${title}`, normalized);
    }
  }

  return Array.from(dedupedByCompositeKey.values());
}

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  const result = await batchUpsert({
    table: 'external_user_monthly_reports',
    data: normalizeMonthlyReportsPayload(json?.data),
    onConflict: 'user_id,group_id,title',
    ignoreDuplicates: true,
  });
  return createMigrationResponse(result, 'user monthly reports');
}
