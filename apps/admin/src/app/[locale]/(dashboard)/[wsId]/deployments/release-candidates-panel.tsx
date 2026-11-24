import { Badge } from '@tuturuuu/ui/badge';
import { getTranslations } from 'next-intl/server';
import type {
  CandidateSummary,
  CandidateVerdict,
} from '@/lib/infrastructure/release-candidates';

const BADGE: Record<
  CandidateVerdict,
  'success' | 'error' | 'warning' | 'secondary'
> = {
  green: 'success',
  red: 'error',
  pending: 'warning',
  unknown: 'secondary',
};
const REPO_URL = 'https://github.com/tutur3u/platform';

export async function ReleaseCandidatesPanel({
  available,
  candidates,
}: {
  available: boolean;
  candidates: CandidateSummary[];
}) {
  const t = await getTranslations('deployments.release_candidates');
  return (
    <section aria-labelledby="release-candidates" className="space-y-3">
      <h2
        id="release-candidates"
        className="font-semibold text-base tracking-tight"
      >
        {t('title')}
      </h2>
      <div className="divide-y rounded-lg border bg-card">
        {!available ? (
          <p className="px-4 py-3 text-muted-foreground text-sm">
            {t('unavailable')}
          </p>
        ) : candidates.length === 0 ? (
          <div className="space-y-1 px-4 py-3 text-sm">
            <p className="text-muted-foreground">{t('empty')}</p>
            <code className="text-xs">
              gh workflow run release-candidate.yaml -f sha=&lt;sha&gt;
            </code>
          </div>
        ) : (
          candidates.map((candidate) => {
            const open = candidate.workflows.filter(
              (workflow) => workflow.status !== 'success'
            );
            return (
              <div key={candidate.sha} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={`${REPO_URL}/commit/${candidate.sha}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-sm underline-offset-2 hover:underline"
                  >
                    {candidate.sha.slice(0, 12)}
                  </a>
                  <Badge variant={BADGE[candidate.verdict]}>
                    {t(`verdicts.${candidate.verdict}`)}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {t('counts', candidate.counts)}
                  </span>
                </div>
                {open.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">
                      {t('not_green', { count: open.length })}
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {open.map((workflow) => (
                        <li key={workflow.path} className="flex gap-2">
                          <span className="text-muted-foreground text-xs">
                            {t(`statuses.${workflow.status}`)}
                          </span>
                          {workflow.url ? (
                            <a
                              href={workflow.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline-offset-2 hover:underline"
                            >
                              {workflow.name}
                            </a>
                          ) : (
                            <span>{workflow.name}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
