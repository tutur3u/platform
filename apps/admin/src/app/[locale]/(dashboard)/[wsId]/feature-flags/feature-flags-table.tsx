import { Badge } from '@tuturuuu/ui/badge';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import type { ReactNode } from 'react';
import {
  type FeatureFlagTranslator,
  FlagRow,
  messageKey,
} from './feature-flag-row';
import type {
  FeatureFlagEnvironmentState,
  FeatureFlagFamilyGroup,
  FeatureFlagRow,
} from './read-model';

export type { FeatureFlagTranslator };

export function FeatureFlagsTable({
  controlFor,
  group,
  secretsHref,
  t,
}: {
  controlFor?: (
    row: FeatureFlagRow,
    state: FeatureFlagEnvironmentState
  ) => ReactNode;
  group: FeatureFlagFamilyGroup;
  secretsHref?: string;
  t: FeatureFlagTranslator;
}) {
  const headingId = `feature-flags-${group.family}`;
  const environments = group.rows[0]?.environments ?? [];
  const scopes = [...new Set(group.rows.map((row) => row.scope))];

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-lg" id={headingId}>
          {t(`families.${messageKey(group.family)}`)}
        </h2>
        {scopes.map((scope) => (
          <Badge key={scope} variant="outline">
            {t(`scopes.${scope}`)}
          </Badge>
        ))}
        <span className="text-muted-foreground text-sm">
          {group.rows.length}
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table aria-labelledby={headingId}>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.flag')}</TableHead>
              <TableHead>{t('columns.kind')}</TableHead>
              <TableHead>{t('columns.stage')}</TableHead>
              <TableHead>{t('columns.apps')}</TableHead>
              {environments.map(({ environment }) => (
                <TableHead key={environment}>
                  {t(`environments.${environment}`)}
                </TableHead>
              ))}
              <TableHead>{t('columns.owner')}</TableHead>
              <TableHead>{t('columns.created')}</TableHead>
              <TableHead>{t('columns.verified')}</TableHead>
              <TableHead>{t('columns.remove_by')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.rows.map((row) => (
              <FlagRow
                controlFor={controlFor}
                key={row.key}
                row={row}
                secretsHref={secretsHref}
                t={t}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
