import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { canViewWorkspaceUsage } from '@tuturuuu/utils/workspace-usage-access';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';

const meterRow = z.object({
  meter: z.enum([
    'sandbox_seconds',
    'participant_seconds',
    'stored_bytes',
    'transfer_bytes',
  ]),
  held: z.number().int().nonnegative().safe(),
  spent: z.number().int().nonnegative().safe(),
  available: z.number().int().nonnegative().safe(),
  ends_at: z.iso.datetime({ offset: true }),
});

/** Render only after the owning settings page has authorized workspace usage. */
export async function WorkspaceUsageMeters({ wsId }: { wsId: string }) {
  if (!canViewWorkspaceUsage(await getPermissions({ wsId }))) return null;
  const t = await getTranslations('workspace-usage-meters');
  const format = await getFormatter();
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db.rpc(
    'workspace_usage_summary' as never,
    { p_ws: wsId } as never
  );
  const rows = z.array(meterRow).safeParse(data);
  if (!error && rows.success && !rows.data.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">{t('title')}</h2>
      {error || !rows.success ? (
        <p role="status">{t('unavailable')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr>
                {(
                  ['meter', 'spent', 'held', 'available', 'reset'] as const
                ).map((key) => (
                  <th key={key} scope="col">
                    {t(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.data.map((row) => {
                const divisor = row.meter.endsWith('_seconds') ? 60 : 2 ** 30;
                return (
                  <tr key={row.meter}>
                    <th scope="row">{t(row.meter)}</th>
                    {(['spent', 'held', 'available'] as const).map((key) => (
                      <td key={key}>
                        {format.number(row[key] / divisor, {
                          maximumFractionDigits: 3,
                        })}
                      </td>
                    ))}
                    <td>
                      {format.dateTime(new Date(row.ends_at), {
                        dateStyle: 'medium',
                        timeZone: 'UTC',
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
