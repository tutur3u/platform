import {
  ActivitySquare,
  AlertTriangle,
  CheckCircle2,
  Database,
  Eye,
} from '@tuturuuu/icons';
import type { Run, TeamLimits } from '@tuturuuu/multiplayer';
import { Badge } from '@tuturuuu/ui/badge';
import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import { Component, type ReactNode } from 'react';
import { useCopy } from './i18n';
import { runInsights } from './run-insights';
import { RunStep } from './run-step';

class MarkdownFallbackBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ReadableMarkdown({ text }: { text: string }) {
  return (
    <MarkdownFallbackBoundary fallback={<p>{text}</p>}>
      <MemoizedReactMarkdown>{text}</MemoizedReactMarkdown>
    </MarkdownFallbackBoundary>
  );
}

export function RunReport({
  isLatest,
  limits,
  run,
  number,
}: {
  isLatest: boolean;
  limits: TeamLimits;
  run: Run;
  number: number;
}) {
  const c = useCopy();
  const insight = runInsights(run, limits);
  const statusCopy = {
    attention: [c.completedWithIssues, c.completedWithIssuesHelp],
    complete: [c.runComplete, c.runCompleteHelp],
    limited: [c.runLimited, c.runLimitedHelp],
  }[insight.status];
  const StatusIcon =
    insight.status === 'complete' ? CheckCircle2 : AlertTriangle;

  return (
    <details className={`run-report status-${insight.status}`} open={isLatest}>
      <summary>
        <span className="run-index">{number}</span>
        <span>
          <span className="run-title-row">
            <strong>{c.practiceRun}</strong>
            <Badge
              variant={insight.status === 'complete' ? 'secondary' : 'outline'}
            >
              <StatusIcon className="size-3" aria-hidden="true" />
              {statusCopy[0]}
            </Badge>
          </span>
          <small className="run-date">
            {new Date(run.at).toLocaleString()}
          </small>
        </span>
        <span className="run-summary-usage">
          {insight.usage.turns}/{insight.usage.turnLimit} {c.turnsShort} ·{' '}
          {insight.usage.toolCalls}/{insight.usage.toolCallLimit}{' '}
          {c.appActionsShort}
        </span>
      </summary>
      <div className="run-report-body">
        <section className="run-health" aria-label={c.runHealth}>
          <div className="run-health-intro">
            <span className="run-health-icon">
              <StatusIcon className="size-5" aria-hidden="true" />
            </span>
            <div>
              <strong>{statusCopy[0]}</strong>
              <p>{statusCopy[1]}</p>
              <Badge variant="outline" className="run-stop-reason">
                {c[`stop_${insight.stopReason}`]}
              </Badge>
            </div>
          </div>
          <div className="run-signal-grid">
            <div>
              <Eye className="size-4" aria-hidden="true" />
              <span>{c.evidenceActions}</span>
              <strong>{insight.reads}</strong>
            </div>
            <div>
              <Database className="size-4" aria-hidden="true" />
              <span>{c.practiceChanges}</span>
              <strong>{insight.writes}</strong>
            </div>
            <div>
              <AlertTriangle className="size-4" aria-hidden="true" />
              <span>{c.toolIssues}</span>
              <strong>{insight.failed}</strong>
            </div>
            <div>
              <ActivitySquare className="size-4" aria-hidden="true" />
              <span>{c.appsUsed}</span>
              <strong>{insight.apps}</strong>
            </div>
          </div>
        </section>
        <div className="run-narrative-grid">
          <section className="run-outcome">
            <p className="run-label">{c.agentAnswer}</p>
            <div className="readable-output">
              <ReadableMarkdown text={run.answer} />
            </div>
          </section>
          <section className="coach-card">
            <p className="run-label">{c.coachNotes}</p>
            <div className="readable-output">
              <ReadableMarkdown text={run.feedback} />
            </div>
          </section>
        </div>
        <section className="run-timeline">
          <div className="run-section-heading">
            <div>
              <p className="run-label">{c.stepByStep}</p>
              <p>{c.stepByStepHelp}</p>
            </div>
            <div className="run-usage">
              <Badge variant="secondary">
                {insight.successful} {c.succeeded}
              </Badge>
              {insight.failed > 0 && (
                <Badge variant="outline">
                  {insight.failed} {c.needsAttention.toLowerCase()}
                </Badge>
              )}
            </div>
          </div>
          {run.trace.length ? (
            <ol className="step-list">
              {run.trace.map((trace, index) => (
                <RunStep
                  key={`${run.id}-${index}`}
                  trace={trace}
                  index={index}
                />
              ))}
            </ol>
          ) : (
            <p className="empty compact">{c.noToolCalls}</p>
          )}
        </section>
        <details className="technical-details run-diagnostics">
          <summary>{c.runDiagnostics}</summary>
          <dl>
            <div className="run-diagnostic-row">
              <dt>{c.runId}</dt>
              <dd>{run.id}</dd>
            </div>
            <div className="run-diagnostic-row">
              <dt>{c.stopReason}</dt>
              <dd>{c[`stop_${insight.stopReason}`]}</dd>
            </div>
            <div className="run-diagnostic-row">
              <dt>{c.scenario}</dt>
              <dd>{run.scenario}</dd>
            </div>
          </dl>
          <details className="technical-details prompt-details">
            <summary>{c.viewPrompt}</summary>
            <pre>{run.prompt}</pre>
          </details>
        </details>
      </div>
    </details>
  );
}
