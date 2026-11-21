import type {
  DevboxAdminRunner,
  DevboxRunnerResourceLimits,
} from '@/lib/devboxes/admin-store';
import { setDevboxRunnerResourceLimitsAction } from './actions';
import type { DevboxControlTranslator } from './devbox-control-shared';

const fields: {
  key: keyof DevboxRunnerResourceLimits;
  max: number;
  min: number;
}[] = [
  { key: 'max_cpu_percent', min: 10, max: 80 },
  { key: 'max_memory_percent', min: 10, max: 80 },
  { key: 'max_sandboxes', min: 1, max: 16 },
  { key: 'max_instances', min: 1, max: 8 },
  { key: 'sandbox_memory_mb', min: 128, max: 4096 },
  { key: 'sandbox_timeout_seconds', min: 1, max: 120 },
  { key: 'sandbox_pids', min: 16, max: 256 },
];

export function DevboxResourceLimits({
  canManage,
  runner,
  t,
  wsId,
}: {
  canManage: boolean;
  runner: DevboxAdminRunner;
  t: DevboxControlTranslator;
  wsId: string;
}) {
  const limits = runner.resource_limits;
  if (!limits) {
    return (
      <span className="text-muted-foreground text-xs">
        {t('features.unavailable')}
      </span>
    );
  }

  return (
    <details className="min-w-44 text-xs">
      <summary className="cursor-pointer font-medium">
        {limits.max_cpu_percent}% CPU · {limits.max_memory_percent}% RAM ·{' '}
        {limits.max_sandboxes} {t('resources.sandboxes')}
      </summary>
      <p className="mt-2 max-w-64 text-muted-foreground">
        {t('resources.scope')}
      </p>
      {canManage ? (
        <form
          action={setDevboxRunnerResourceLimitsAction.bind(
            null,
            wsId,
            runner.id
          )}
          className="mt-3 grid min-w-56 gap-2"
        >
          {fields.map(({ key, min, max }) => (
            <label className="grid gap-1" key={key}>
              <span>{t(`resources.${key}`)}</span>
              <input
                className="h-8 w-full rounded-md border border-input bg-background px-2 tabular-nums"
                defaultValue={limits[key]}
                disabled={runner.status === 'revoked'}
                max={max}
                min={min}
                name={key}
                required
                type="number"
              />
            </label>
          ))}
          <button
            className="h-8 rounded-md border border-input bg-background px-3 font-medium hover:bg-accent disabled:opacity-50"
            disabled={runner.status === 'revoked'}
            type="submit"
          >
            {t('resources.save')}
          </button>
        </form>
      ) : (
        <dl className="mt-2 grid gap-1">
          {fields.map(({ key }) => (
            <div className="flex justify-between gap-2" key={key}>
              <dt>{t(`resources.${key}`)}</dt>
              <dd className="tabular-nums">{limits[key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </details>
  );
}
