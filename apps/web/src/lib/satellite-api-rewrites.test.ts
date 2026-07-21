import { describe, expect, it } from 'vitest';
import { createSatelliteApiRewrites } from './satellite-api-rewrites';

describe('createSatelliteApiRewrites', () => {
  it('keeps migrated dashboard dependencies available on the web origin', () => {
    expect(
      createSatelliteApiRewrites({
        calendarAppOrigin: 'https://calendar.example.com/',
        infrastructureAppOrigin: 'https://infrastructure.example.com/',
      })
    ).toEqual([
      {
        source: '/api/v1/infrastructure/ai/models',
        destination:
          'https://infrastructure.example.com/api/v1/infrastructure/ai/models',
      },
      {
        source: '/api/v1/infrastructure/resolve-workspace-id',
        destination:
          'https://infrastructure.example.com/api/v1/infrastructure/resolve-workspace-id',
      },
      {
        source: '/api/v1/users/calendar-settings',
        destination:
          'https://calendar.example.com/api/v1/users/calendar-settings',
      },
      {
        source: '/api/v1/workspaces/:wsId/calendar-settings',
        destination:
          'https://calendar.example.com/api/v1/workspaces/:wsId/calendar-settings',
      },
    ]);
  });
});
