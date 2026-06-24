'use client';

import { Search } from '@tuturuuu/icons';
import type {
  ObservabilityLogLevel,
  ObservabilitySource,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Input } from '@tuturuuu/ui/input';
import type { MonitoringTranslator } from './types';

const timeframeOptions = [1, 6, 12, 24, 72, 168] as const;

function timeframeKey(value: number) {
  if (value === 1) return 'last_hour';
  if (value === 6) return 'last_6_hours';
  if (value === 12) return 'last_12_hours';
  if (value === 72) return 'last_3_days';
  if (value === 168) return 'last_7_days';
  return 'last_24_hours';
}

export function ProjectControls({
  level,
  onLevelChange,
  onProjectChange,
  onQueryChange,
  onSourceChange,
  onTimeframeChange,
  projectId,
  projects,
  query,
  source,
  t,
  timeframeHours,
}: {
  level: ObservabilityLogLevel | 'all';
  onLevelChange: (value: ObservabilityLogLevel | 'all') => void;
  onProjectChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onSourceChange: (value: ObservabilitySource | 'all') => void;
  onTimeframeChange: (value: number) => void;
  projectId: string;
  projects: Array<{ id: string; name: string }>;
  query: string;
  source: ObservabilitySource | 'all';
  t: MonitoringTranslator;
  timeframeHours: number;
}) {
  const projectOptions =
    projects.length > 0 ? projects : [{ id: projectId, name: projectId }];

  return (
    <>
      <select
        className="h-9 max-w-52 rounded-md border border-border bg-background px-3 text-sm"
        onChange={(event) => onProjectChange(event.target.value)}
        value={projectId}
      >
        {projectOptions.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <label className="relative">
        <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="h-9 w-56 pl-8"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('search_placeholder')}
          value={query}
        />
      </label>
      <select
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        onChange={(event) =>
          onSourceChange(event.target.value as ObservabilitySource | 'all')
        }
        value={source}
      >
        <option value="all">{t('all_sources')}</option>
        <option value="api">api</option>
        <option value="cron">cron</option>
        <option value="server">server</option>
      </select>
      <select
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        onChange={(event) =>
          onLevelChange(event.target.value as ObservabilityLogLevel | 'all')
        }
        value={level}
      >
        <option value="all">{t('all_levels')}</option>
        <option value="error">error</option>
        <option value="warn">warn</option>
        <option value="info">info</option>
        <option value="debug">debug</option>
      </select>
      <select
        className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        onChange={(event) =>
          onTimeframeChange(Number.parseInt(event.target.value, 10))
        }
        value={timeframeHours}
      >
        {timeframeOptions.map((value) => (
          <option key={value} value={value}>
            {t(timeframeKey(value))}
          </option>
        ))}
      </select>
    </>
  );
}
