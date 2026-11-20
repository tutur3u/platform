'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import type { FormsResults } from '../../server/forms-results/results';

export interface FormsResultsPanelProps {
  meetingId: string;
  launchId: string;
  readResults: (signal: AbortSignal) => Promise<FormsResults>;
  csvHref: string;
  summarize?: {
    run: (requestId: string) => Promise<{ summary: string | null }>;
    label: string;
    pending: string;
    unavailable: string;
  };
  labels: {
    loading: string;
    error: string;
    retry: string;
    empty: string;
    exportCsv: string;
    anonymous: string;
    named: string;
    responses: (count: number) => string;
    answered: (count: number) => string;
  };
}

export function FormsResultsPanel(props: FormsResultsPanelProps) {
  return (
    <LaunchResults
      key={JSON.stringify([props.meetingId, props.launchId])}
      {...props}
    />
  );
}

function LaunchResults({
  meetingId,
  launchId,
  readResults,
  csvHref,
  labels,
  summarize,
}: FormsResultsPanelProps) {
  const query = useQuery({
    queryKey: ['meet', meetingId, 'forms-results', launchId],
    queryFn: ({ signal }) => readResults(signal),
    refetchInterval: 5000,
    retry: false,
    gcTime: 0,
  });

  if (query.isPending) return <p role="status">{labels.loading}</p>;
  if (query.isError) {
    return (
      <div className="space-y-2">
        <p role="alert">{labels.error}</p>
        <Button
          onClick={() => void query.refetch()}
          size="sm"
          variant="outline"
        >
          {labels.retry}
        </Button>
      </div>
    );
  }

  const results = query.data;
  return (
    <section className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-semibold">{results.title}</h3>
          <p className="text-muted-foreground text-sm">
            {labels.responses(results.responseCount)} ·{' '}
            {labels[results.responseMode]}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <a href={csvHref} download>
            {labels.exportCsv}
          </a>
        </Button>
      </header>
      {summarize && results.responseCount > 0 && (
        <ResultsSummary {...summarize} />
      )}
      {results.responseCount === 0 ? (
        <p className="text-muted-foreground text-sm">{labels.empty}</p>
      ) : (
        <ol className="divide-y rounded-lg border px-3">
          {results.questions.map((question) => (
            <li className="space-y-2 py-3" key={question.id}>
              <h4 className="break-words font-medium text-sm">
                {question.title}
              </h4>
              <p className="text-muted-foreground text-xs">
                {labels.answered(question.answeredCount)}
              </p>
              <dl className="space-y-1 text-sm">
                {question.breakdown.map(({ label, count }) => (
                  <div className="flex justify-between gap-3" key={label}>
                    <dt className="min-w-0 break-words">{label}</dt>
                    <dd className="tabular-nums">{count}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ResultsSummary({
  run,
  label,
  pending,
  unavailable,
}: NonNullable<FormsResultsPanelProps['summarize']>) {
  const mutation = useMutation({
    mutationFn: () => run(crypto.randomUUID()),
    retry: false,
  });

  return (
    <div className="space-y-2">
      <Button
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        size="sm"
        variant="outline"
      >
        {mutation.isPending ? pending : label}
      </Button>
      {mutation.isError || (mutation.isSuccess && !mutation.data.summary) ? (
        <p className="text-muted-foreground text-sm" role="status">
          {unavailable}
        </p>
      ) : mutation.data?.summary ? (
        <p className="break-words text-sm" role="status">
          {mutation.data.summary}
        </p>
      ) : null}
    </div>
  );
}
