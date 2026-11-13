import { plainText } from '../src/changelog/schema.ts';
import { feedItem } from '../src/live/feed.ts';

export const REPO = 'tutur3u/platform';
export const MODEL = 'gemini-3.1-flash-lite'; // packages/ai/src/credits/model-mapping.ts:7
export const RELEASE_TITLE = 'chore(release): release production';

export function releaseWindows(releases, prs) {
  const sorted = [...releases].sort((a, b) =>
    b.merged_at.localeCompare(a.merged_at)
  );
  return sorted.slice(0, 10).flatMap((release, i) => {
    const previous = sorted[i + 1];
    if (!previous) return [];
    return [
      {
        release,
        prs: prs
          .filter(
            (pr) =>
              pr.merged_at &&
              pr.base?.ref === 'main' &&
              pr.base?.repo?.full_name === REPO &&
              !pr.base.repo.private &&
              pr.merged_at > previous.merged_at &&
              pr.merged_at <= release.merged_at
          )
          .sort((a, b) => a.number - b.number),
      },
    ];
  });
}

export function publicItems(prs) {
  return prs.flatMap((pr) => {
    if (
      !pr.merged_at ||
      pr.base?.ref !== 'main' ||
      pr.base?.repo?.full_name !== REPO ||
      pr.base.repo.private
    )
      return [];
    let title;
    try {
      title = plainText(pr.title, 400);
    } catch {
      return [];
    }
    const item = feedItem({
      number: pr.number,
      title,
      state: 'merged',
      mergedAt: pr.merged_at,
      draft: false,
      approved: false,
    });
    return item
      ? [
          {
            number: pr.number,
            title: item.title,
            product: item.track,
            body: typeof pr.body === 'string' ? pr.body.slice(0, 3000) : '',
            labels: (pr.labels ?? []).map((label) => label.name),
            sha: pr.merge_commit_sha,
          },
        ]
      : [];
  });
}

export async function fetchInputs(get) {
  const releases = [];
  // Release-please targets production; main carries synchronized release commits.
  let complete = false;
  for (let page = 1; page <= 5; page++) {
    const rows = await get(
      `/repos/${REPO}/pulls?state=closed&base=production&sort=updated&direction=desc&per_page=100&page=${page}`
    );
    releases.push(
      ...rows.filter(
        (pr) =>
          pr.title === RELEASE_TITLE &&
          pr.merged_at &&
          pr.base?.repo?.full_name === REPO &&
          !pr.base.repo.private
      )
    );
    releases.sort((a, b) => b.merged_at.localeCompare(a.merged_at));
    if (
      rows.length < 100 ||
      (releases.length >= 11 && rows.at(-1).updated_at < releases[10].merged_at)
    ) {
      complete = true;
      break;
    }
  }
  releases.sort((a, b) => b.merged_at.localeCompare(a.merged_at));
  const slots = releases.slice(0, 11);
  if (!complete || slots.length < 2) throw Error('GH_INCOMPLETE');
  const prs = [];
  for (let page = 1; page <= 30; page++) {
    const rows = await get(
      `/repos/${REPO}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=100&page=${page}`
    );
    prs.push(...rows);
    // updated_at cannot precede merged_at, so this is a complete lower bound.
    if (rows.length < 100 || rows.at(-1).updated_at < slots.at(-1).merged_at)
      return releaseWindows(slots, prs);
  }
  throw Error('GH_INCOMPLETE');
}
