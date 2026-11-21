import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import type { StoredAudit } from '@tuturuuu/feature-flags';
import { formatInstant } from './feature-flag-row';
import type { FeatureFlagTranslator } from './feature-flag-row';

function valueLabel(value: boolean | null, t: FeatureFlagTranslator) {
  if (value === null) return t('controls.reset');
  return t(value ? 'values.on' : 'values.off');
}

export function FeatureFlagAudit({
  rows,
  t,
  unavailable,
}: {
  rows: readonly StoredAudit[];
  t: FeatureFlagTranslator;
  unavailable: boolean;
}) {
  return (
    <section aria-labelledby="feature-flag-audit" className="space-y-2">
      <h2 className="font-semibold text-lg" id="feature-flag-audit">
        {t('audit.title')}
      </h2>
      {unavailable ? (
        <p className="text-muted-foreground text-sm">
          {t('audit.unavailable')}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('audit.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table aria-labelledby="feature-flag-audit">
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.flag')}</TableHead>
                <TableHead>{t('columns.owner')}</TableHead>
                <TableHead>{t('audit.title')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.operationId}>
                  <TableCell className="font-mono text-xs">
                    {row.flagKey}
                    <div className="text-muted-foreground">
                      {t(`environments.${row.environment}`)}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs" title={row.actorId}>
                    {row.actorId.slice(0, 8)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {valueLabel(row.oldOverride, t)} →{' '}
                    {valueLabel(row.newOverride, t)}
                    <div className="text-muted-foreground">
                      {row.oldRevision} → {row.newRevision}
                    </div>
                    <time dateTime={row.occurredAt}>
                      {formatInstant(row.occurredAt)}
                    </time>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
