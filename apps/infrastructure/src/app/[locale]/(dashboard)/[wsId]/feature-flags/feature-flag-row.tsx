import { Badge } from '@tuturuuu/ui/badge';
import { TableCell, TableRow } from '@tuturuuu/ui/table';
import type { ReactNode } from 'react';
import type { FeatureFlagEnvironmentState, FeatureFlagRow } from './read-model';

export type FeatureFlagTranslator = (key: string) => string;

const LIFECYCLE_VARIANT = {
  'awaiting-verification': 'outline',
  overdue: 'error',
  retained: 'secondary',
  scheduled: 'warning',
} as const;

export const messageKey = (value: string) => value.replaceAll('-', '_');

export function formatInstant(value: string) {
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
  control,
  state,
  t,
}: {
  control: ReactNode;
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
        {control}
      </div>
    </TableCell>
  );
}

export function FlagRow({
  controlFor,
  row,
  secretsHref,
  t,
}: {
  controlFor?: (
    row: FeatureFlagRow,
    state: FeatureFlagEnvironmentState
  ) => ReactNode;
  row: FeatureFlagRow;
  secretsHref?: string;
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
        {row.readOnly === 'workspace-secret' ? (
          <p className="mt-1 text-muted-foreground text-xs">
            {t('controls.managed_in_secrets')}
            {secretsHref ? (
              <>
                {' '}
                <a className="underline" href={secretsHref}>
                  {t('controls.secrets_link')}
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        {row.readOnly === 'mobile-build' ? (
          <p className="mt-1 text-muted-foreground text-xs">
            {t('controls.build_time')}
          </p>
        ) : null}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{t(`kinds.${messageKey(row.kind)}`)}</Badge>
      </TableCell>
      <TableCell>
        {row.rollout ? (
          <Badge variant="outline">{t('stages.' + row.rollout.stage)}</Badge>
        ) : (
          <span className="text-muted-foreground">
            {t('stages.unconfigured')}
          </span>
        )}
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
        <EnvironmentCell
          control={controlFor?.(row, state) ?? null}
          key={state.environment}
          state={state}
          t={t}
        />
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
          {row.rollout?.removeBy ? (
            <time dateTime={row.rollout.removeBy}>{row.rollout.removeBy}</time>
          ) : lifecycle.removeBy ? (
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
