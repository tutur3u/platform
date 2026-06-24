export type MonitoringObservabilityMode =
  | 'analytics'
  | 'deployments'
  | 'logs'
  | 'observability'
  | 'overview'
  | 'projects'
  | 'resources';

export type MonitoringTone =
  | 'amber'
  | 'blue'
  | 'green'
  | 'muted'
  | 'orange'
  | 'red';

export type MonitoringTranslator = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;
