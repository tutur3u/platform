interface SatelliteApiRewriteOptions {
  calendarAppOrigin: string;
  infrastructureAppOrigin: string;
}

function withoutTrailingSlash(origin: string) {
  return origin.replace(/\/+$/, '');
}

export function createSatelliteApiRewrites({
  calendarAppOrigin,
  infrastructureAppOrigin,
}: SatelliteApiRewriteOptions) {
  const calendarOrigin = withoutTrailingSlash(calendarAppOrigin);
  const infrastructureOrigin = withoutTrailingSlash(infrastructureAppOrigin);

  return [
    {
      source: '/api/v1/infrastructure/ai/models',
      destination: `${infrastructureOrigin}/api/v1/infrastructure/ai/models`,
    },
    {
      source: '/api/v1/infrastructure/resolve-workspace-id',
      destination: `${infrastructureOrigin}/api/v1/infrastructure/resolve-workspace-id`,
    },
    {
      source: '/api/v1/users/calendar-settings',
      destination: `${calendarOrigin}/api/v1/users/calendar-settings`,
    },
    {
      source: '/api/v1/workspaces/:wsId/calendar-settings',
      destination: `${calendarOrigin}/api/v1/workspaces/:wsId/calendar-settings`,
    },
  ];
}
