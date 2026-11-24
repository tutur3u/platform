import 'server-only';
import {
  type CandidateSummary,
  MAX_RELEASE_CANDIDATES,
  parseCandidateRefs,
  RELEASE_CANDIDATE_PREFIX,
  RELEASE_CANDIDATE_REPO,
  summarizeCandidateRuns,
} from './release-candidates';

async function readPublicMetadata(path: string): Promise<unknown | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${RELEASE_CANDIDATE_REPO}/${path}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        // workerd rejects redirect: 'error'; a redirect is not ok and reads as unknown.
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      }
    );
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function unknownSummary(sha: string): CandidateSummary {
  return summarizeCandidateRuns(sha, null);
}

/** At most six public reads: one refs list plus one runs list per scanned ref. */
export async function getReleaseCandidates(): Promise<{
  available: boolean;
  candidates: CandidateSummary[];
}> {
  try {
    const refs = await readPublicMetadata(
      `git/matching-refs/heads/${RELEASE_CANDIDATE_PREFIX}`
    );
    if (!Array.isArray(refs)) return { available: false, candidates: [] };
    const candidates = await Promise.all(
      parseCandidateRefs(refs).map(async ({ sha }) => {
        const runs = await readPublicMetadata(
          `actions/runs?head_sha=${sha}&per_page=100`
        );
        return runs === null
          ? unknownSummary(sha)
          : summarizeCandidateRuns(sha, runs);
      })
    );
    candidates.sort((a, b) =>
      (b.newestAt ?? '').localeCompare(a.newestAt ?? '')
    );
    return {
      available: true,
      candidates: candidates.slice(0, MAX_RELEASE_CANDIDATES),
    };
  } catch {
    return { available: false, candidates: [] };
  }
}
