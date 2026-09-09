import type { Run, TeamLimits } from '@tuturuuu/multiplayer';
import { Badge } from '@tuturuuu/ui/badge';
import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import { Component, type ReactNode } from 'react';
import { useCopy } from './i18n';

function pretty(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

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
  const usage = run.usage ?? {
    turns: run.trace.length + 1,
    toolCalls: run.trace.length,
    turnLimit: limits.agentTurnLimit,
    toolCallLimit: limits.toolCallLimit,
  };
  return (
    <details className="run-report" open={isLatest}>
      <summary>
        <span className="run-index">{number}</span>
        <span>
          <strong>{c.practiceRun}</strong>
          <small>{new Date(run.at).toLocaleString()}</small>
        </span>
        <Badge variant="outline">
          {usage.toolCalls} / {usage.toolCallLimit} {c.toolCallsShort}
        </Badge>
      </summary>
      <div className="run-report-body">
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
        <section>
          <div className="run-section-heading">
            <div>
              <p className="run-label">{c.stepByStep}</p>
              <p>{c.stepByStepHelp}</p>
            </div>
            <div className="run-usage">
              <Badge variant="secondary">
                {usage.turns}/{usage.turnLimit} {c.turnsShort}
              </Badge>
              <Badge variant="secondary">
                {usage.toolCalls}/{usage.toolCallLimit} {c.toolCallsShort}
              </Badge>
            </div>
          </div>
          {run.trace.length ? (
            <ol className="step-list">
              {run.trace.map((trace, index) => (
                <li key={`${run.id}-${index}`}>
                  <span className="step-number">{index + 1}</span>
                  <div>
                    <strong>{trace.tool.replace('.', ' · ')}</strong>
                    <details className="technical-details">
                      <summary>{c.viewTechnicalDetails}</summary>
                      <p>{c.request}</p>
                      <pre>{pretty(trace.input)}</pre>
                      <p>{c.response}</p>
                      <pre>{pretty(trace.output)}</pre>
                    </details>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty compact">{c.noToolCalls}</p>
          )}
        </section>
        <details className="technical-details prompt-details">
          <summary>{c.viewPrompt}</summary>
          <pre>{run.prompt}</pre>
        </details>
      </div>
    </details>
  );
}
