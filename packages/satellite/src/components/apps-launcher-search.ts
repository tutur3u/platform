import type { LaunchableApp } from '@tuturuuu/utils/launchable-apps';

type AppSearchCopy = {
  description: string;
  title: string;
};

/** Half-open `[start, end)` character range inside the displayed title. */
export type AppsLauncherHighlight = readonly [start: number, end: number];

export type AppsLauncherMatch = {
  app: LaunchableApp;
  highlight: readonly AppsLauncherHighlight[];
  score: number;
};

/**
 * Folds text for matching. It lowercases with locale rules and keeps one
 * output character per input character, so match offsets index straight into
 * the original title for highlighting. Ranking and highlighting both read
 * through this function, which makes it the single place to extend folding
 * (for example accent-insensitive matching) without desynchronising them.
 */
export function foldAppsLauncherText(value: string) {
  return value.toLocaleLowerCase();
}

function foldQuery(query: string) {
  return foldAppsLauncherText(query.trim().replace(/\s+/g, ' '));
}

function isWordBoundary(value: string, index: number) {
  if (index === 0) return true;
  return !/[\p{L}\p{N}]/u.test(value.charAt(index - 1));
}

function findWordStart(value: string, query: string) {
  let index = value.indexOf(query, 1);
  while (index > 0) {
    if (isWordBoundary(value, index)) return index;
    index = value.indexOf(query, index + 1);
  }
  return -1;
}

function findSubsequence(value: string, query: string) {
  const positions: number[] = [];
  let cursor = 0;
  for (const char of query) {
    if (char === ' ') continue;
    const index = value.indexOf(char, cursor);
    if (index === -1) return null;
    positions.push(index);
    cursor = index + 1;
  }
  return positions;
}

function toRanges(positions: readonly number[]) {
  const ranges: [number, number][] = [];
  for (const position of positions) {
    const last = ranges.at(-1);
    if (last && last[1] === position) last[1] = position + 1;
    else ranges.push([position, position + 1]);
  }
  return ranges;
}

function range(start: number, length: number): AppsLauncherHighlight[] {
  return [[start, start + length]];
}

/**
 * Scores one app for a folded query; lower is better and `null` is no match.
 * Order: exact name, name prefix, name word start, exact alias, alias prefix
 * or word start, name substring, alias substring, description, and finally a
 * compact in-order character match on the name.
 */
function scoreApp(
  app: LaunchableApp,
  copy: AppSearchCopy,
  query: string
): Omit<AppsLauncherMatch, 'app'> | null {
  const title = foldAppsLauncherText(copy.title);
  const slug = foldAppsLauncherText(app.slug);
  const aliases = app.aliases.map(foldAppsLauncherText);

  if (title === query) return { highlight: range(0, query.length), score: 0 };
  if (slug === query) return { highlight: [], score: 0 };
  if (title.startsWith(query)) {
    return { highlight: range(0, query.length), score: 1 };
  }
  if (slug.startsWith(query)) return { highlight: [], score: 1 };

  const wordStart = findWordStart(title, query);
  if (wordStart > 0) {
    return { highlight: range(wordStart, query.length), score: 2 };
  }
  if (aliases.includes(query)) return { highlight: [], score: 3 };
  if (
    aliases.some(
      (alias) => alias.startsWith(query) || findWordStart(alias, query) > 0
    )
  ) {
    return { highlight: [], score: 4 };
  }

  const substring = title.indexOf(query);
  if (substring > 0) {
    return { highlight: range(substring, query.length), score: 5 };
  }
  if (slug.includes(query)) return { highlight: [], score: 5 };
  if (aliases.some((alias) => alias.includes(query))) {
    return { highlight: [], score: 6 };
  }
  if (foldAppsLauncherText(copy.description).includes(query)) {
    return { highlight: [], score: 7 };
  }

  if (query.replace(/ /g, '').length < 2) return null;
  const positions = findSubsequence(title, query);
  if (!positions) return null;
  const spread = (positions.at(-1) ?? 0) - (positions[0] ?? 0);
  return { highlight: toRanges(positions), score: 8 + spread / 100 };
}

export function searchAppsLauncher(
  apps: readonly LaunchableApp[],
  query: string,
  getCopy: (app: LaunchableApp) => AppSearchCopy
): AppsLauncherMatch[] {
  const foldedQuery = foldQuery(query);
  if (!foldedQuery) {
    return apps.map((app) => ({ app, highlight: [], score: 0 }));
  }

  return apps
    .map((app, index) => {
      const match = scoreApp(app, getCopy(app), foldedQuery);
      return match ? { ...match, app, index } : null;
    })
    .filter((match) => match !== null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ app, highlight, score }) => ({ app, highlight, score }));
}

export function rankAppsLauncherMatches(
  apps: readonly LaunchableApp[],
  query: string,
  getCopy: (app: LaunchableApp) => AppSearchCopy
) {
  return searchAppsLauncher(apps, query, getCopy).map(({ app }) => app);
}
