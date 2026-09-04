import type { LaunchableApp } from '@tuturuuu/utils/launchable-apps';

type AppSearchCopy = {
  description: string;
  title: string;
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function getMatchScore(app: LaunchableApp, copy: AppSearchCopy, query: string) {
  const slug = normalize(app.slug);
  const title = normalize(copy.title);
  const aliases = app.aliases.map(normalize);
  const description = normalize(copy.description);

  if (title === query || slug === query) return 0;
  if (title.startsWith(query) || slug.startsWith(query)) return 1;
  if (aliases.some((alias) => alias === query)) return 2;
  if (aliases.some((alias) => alias.startsWith(query))) return 3;
  if (title.includes(query) || slug.includes(query)) return 4;
  if (aliases.some((alias) => alias.includes(query))) return 5;
  if (description.includes(query)) return 6;

  return null;
}

export function rankAppsLauncherMatches(
  apps: readonly LaunchableApp[],
  query: string,
  getCopy: (app: LaunchableApp) => AppSearchCopy
) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [...apps];

  return apps
    .map((app, index) => ({
      app,
      index,
      score: getMatchScore(app, getCopy(app), normalizedQuery),
    }))
    .filter(
      (result): result is typeof result & { score: number } =>
        result.score !== null
    )
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map(({ app }) => app);
}
