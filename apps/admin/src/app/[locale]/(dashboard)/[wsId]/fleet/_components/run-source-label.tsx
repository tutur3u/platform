import { opsToneClasses } from '@tuturuuu/ui/custom/ops';
import { describeRunSource } from '@/lib/fleet/run-source';
import type { FleetTranslator } from './fleet-data';

export function RunSourceLabel({
  command,
  t,
}: {
  command: string[];
  t: FleetTranslator;
}) {
  const source = describeRunSource(command);

  switch (source.kind) {
    case 'commit':
      return (
        <span className="flex min-w-0 items-baseline gap-2">
          <code className="shrink-0 text-muted-foreground" title={source.sha}>
            {source.sha.slice(0, 7)}
          </code>
          <span className="truncate font-mono">{source.argv.join(' ')}</span>
        </span>
      );
    case 'command':
      return (
        <span className="truncate font-mono">
          {source.argv.join(' ') || '-'}
        </span>
      );
    case 'maintenance':
      return (
        <span className="text-muted-foreground">
          {t('jobs.source.maintenance', { name: source.name })}
        </span>
      );
    case 'invalid_envelope':
      return (
        <span className={opsToneClasses.warning.text}>
          {t('jobs.source.invalid')}
        </span>
      );
  }
}
