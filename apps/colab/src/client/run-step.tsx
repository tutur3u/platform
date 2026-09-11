import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Eye,
  Search,
  SquareTerminal,
} from '@tuturuuu/icons';
import { mockAppCatalog, type Trace } from '@tuturuuu/multiplayer';
import { Badge } from '@tuturuuu/ui/badge';
import { useCopy } from './i18n';
import { traceInsight } from './run-insights';

function pretty(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function appName(value: string) {
  const knownApp = mockAppCatalog.find((app) => app.id === value);
  if (knownApp) return knownApp.name;
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

export function RunStep({ index, trace }: { index: number; trace: Trace }) {
  const c = useCopy();
  const insight = traceInsight(trace);
  const actionLabels: Record<string, string> = {
    create: c.createdIn,
    draft: c.draftedIn,
    generate_image: c.imageGeneratedIn,
    read: c.openedIn,
    search: c.searchedIn,
    update: c.updatedIn,
  };
  const Icon =
    insight.status === 'error'
      ? AlertTriangle
      : insight.action === 'search'
        ? Search
        : insight.action === 'read'
          ? Eye
          : insight.isWrite
            ? Database
            : SquareTerminal;
  const errorHelp =
    insight.errorCode === 'image_unavailable'
      ? c.imageUnavailableHelp
      : insight.errorCode === 'mock_record_missing'
        ? c.recordMissingHelp
        : insight.errorCode === 'unknown_tool'
          ? c.unsupportedActionHelp
          : c.actionFailedHelp;

  return (
    <li className={insight.status === 'error' ? 'is-error' : undefined}>
      <span className="step-number">{index + 1}</span>
      <div className="run-step-content">
        <div className="run-step-heading">
          <span className="run-step-icon">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div>
            <strong>
              {insight.status === 'error'
                ? c.attemptedIn
                : (actionLabels[insight.action] ?? c.attemptedIn)}{' '}
              {appName(insight.app)}
            </strong>
            {insight.detail && <p>{insight.detail}</p>}
          </div>
          <Badge variant={insight.status === 'error' ? 'outline' : 'secondary'}>
            {insight.status === 'error' ? (
              <AlertTriangle className="size-3" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="size-3" aria-hidden="true" />
            )}
            {insight.status === 'error' ? c.needsAttention : c.succeeded}
          </Badge>
        </div>
        {insight.status === 'error' && (
          <p className="run-step-help">{errorHelp}</p>
        )}
        {insight.imageUrl && (
          <a
            className="colab-markdown"
            href={insight.imageUrl}
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={insight.imageUrl}
              alt={insight.imageAlt || c.agentAnswer}
              loading="lazy"
            />
            <span>{c.viewArtwork}</span>
          </a>
        )}
        <details className="technical-details">
          <summary>{c.viewTechnicalDetails}</summary>
          <div className="technical-payload-grid">
            <div>
              <p>{c.request}</p>
              <pre>{pretty(trace.input)}</pre>
            </div>
            <div>
              <p>{c.response}</p>
              <pre>{pretty(trace.output)}</pre>
            </div>
          </div>
        </details>
      </div>
    </li>
  );
}
