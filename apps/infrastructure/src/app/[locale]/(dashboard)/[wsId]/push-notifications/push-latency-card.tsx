import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { PushLatencyResult } from '@/lib/notifications/push-latency';

type Translate = (key: string, values?: Record<string, unknown>) => string;

function formatMs(locale: string, value: number) {
  return value < 1000
    ? `${value.toLocaleString(locale)} ms`
    : `${(value / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} s`;
}

export function PushLatencyCard({
  latency,
  locale,
  t,
}: {
  latency: PushLatencyResult;
  locale: string;
  t: Translate;
}) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{t('latency.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {latency.status === 'error' ? (
          <div className="text-destructive text-sm">{t('latency.error')}</div>
        ) : latency.channels.length === 0 ? (
          <div className="text-muted-foreground text-sm">
            {t('latency.empty')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">
                    {t('latency.channel')}
                  </th>
                  <th className="py-2 pr-4 text-right font-medium">
                    {t('latency.sent')}
                  </th>
                  <th className="py-2 pr-4 text-right font-medium">p50</th>
                  <th className="py-2 pr-4 text-right font-medium">p95</th>
                  <th className="py-2 text-right font-medium">
                    {t('latency.max')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {latency.channels.map((row) => (
                  <tr key={row.channel} className="border-border border-t">
                    <td className="py-2 pr-4">
                      {t(`latency.channels.${row.channel}`)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.sentCount.toLocaleString(locale)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatMs(locale, row.p50Ms)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatMs(locale, row.p95Ms)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMs(locale, row.maxMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
