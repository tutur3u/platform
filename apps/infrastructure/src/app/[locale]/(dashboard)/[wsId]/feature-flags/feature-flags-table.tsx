import { Badge } from '@tuturuuu/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import type { ComponentProps } from 'react';
import type {
  FeatureFlagEnvironmentState,
  FeatureFlagFamilyGroup,
  FeatureFlagRow,
} from './read-model';

export type FeatureFlagTranslator = (key: string) => string;

const LIFECYCLE_VARIANT: Record<
  FeatureFlagRow['lifecycle']['status'],
  ComponentProps<typeof Badge>['variant']
> = {
  'awaiting-verification': 'outline',
  overdue: 'error',
  retained: 'secondary',
  scheduled: 'warning',
};

const messageKey = (value: string) => value.replaceAll('-', '_');

function formatInstant(value: string) {
  const utc = new Date(value).toISOString();
  return `${utc.slice(0, 10)} ${utc.slice(11, 16)} UTC`;
}

function Missing({ legacy, t }: { legacy: boolean; t: FeatureFlagTranslator }) {
  return (
    <span className="text-muted-foreground">
      {t(legacy ? 'values.legacy_unknown' : 'values.not_recorded')}
    </span>
  );
}

function EnvironmentCell({
  state,
  t,
}: {
  state: FeatureFlagEnvironmentState;
  t: FeatureFlagTranslator;
}) {
  return (
    <TableCell>
      <div className="flex flex-col items-start gap-1">
        <Badge variant="outline">{t(`values.${state.effective}`)}</Badge>
        <span className="text-muted-foreground text-xs">
          {t(
            state.declaredDefault ? 'values.default_on' : 'values.default_off'
          )}
        </span>
      </div>
    </TableCell>
  );
}

function FlagRow({
  row,
  t,
}: {
  row: FeatureFlagRow;
  t: FeatureFlagTranslator;
}) {
  const { lifecycle } = row;
  return (
    <TableRow data-flag-key={row.key}>
      <TableCell className="max-w-[280px]">
        <div className="font-medium font-mono text-xs">{row.key}</div>
        {row.description ? (
          <div className="mt-1 text-muted-foreground text-xs">
            {row.description}
          </div>
        ) : null}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{t(`kinds.${messageKey(row.kind)}`)}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          {row.apps.map((app) => (
            <Badge key={app} variant="outline">
              {app}
            </Badge>
          ))}
          {row.appsComplete ? null : (
            <span className="text-muted-foreground text-xs">
              {t(row.apps.length ? 'values.partial' : 'values.untraced')}
            </span>
          )}
        </div>
      </TableCell>
      {row.environments.map((state) => (
        <EnvironmentCell key={state.environment} state={state} t={t} />
      ))}
      <TableCell>
        {row.owner ?? <Missing legacy={row.legacy} t={t} />}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {row.createdAt ? (
          <time dateTime={row.createdAt}>{row.createdAt}</time>
        ) : (
          <Missing legacy={row.legacy} t={t} />
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {row.verifiedOnProdAt ? (
          <time dateTime={row.verifiedOnProdAt}>
            {formatInstant(row.verifiedOnProdAt)}
          </time>
        ) : (
          <span className="text-muted-foreground">
            {t('values.not_verified')}
          </span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <div className="flex flex-col items-start gap-1">
          <Badge variant={LIFECYCLE_VARIANT[lifecycle.status]}>
            {t(`lifecycle.${messageKey(lifecycle.status)}`)}
          </Badge>
          {lifecycle.removeBy ? (
            <time
              className="text-muted-foreground text-xs"
              dateTime={lifecycle.removeBy}
            >
              {formatInstant(lifecycle.removeBy)}
            </time>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function FeatureFlagsTable({
  group,
  t,
}: {
  group: FeatureFlagFamilyGroup;
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
              <FlagRow key={row.key} row={row} t={t} />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
