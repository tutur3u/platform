import { expect, test } from '@playwright/test';

test.describe('Mira private catalog API', () => {
  test('lists achievements through the app API', async ({ request }) => {
    const response = await request.get('/api/v1/mira/achievements', {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      achievements: unknown[];
      grouped: Record<string, unknown[]>;
      stats: {
        completion_percentage: number;
        total: number;
        total_xp_earned: number;
        unlocked: number;
      };
    };

    expect(Array.isArray(body.achievements)).toBe(true);
    expect(body.grouped).toEqual(expect.any(Object));
    expect(body.stats).toEqual(
      expect.objectContaining({
        completion_percentage: expect.any(Number),
        total: expect.any(Number),
        total_xp_earned: expect.any(Number),
        unlocked: expect.any(Number),
      })
    );
  });

  test('loads pet state through the app API', async ({ request }) => {
    const response = await request.get('/api/v1/mira/pet', {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);

    const body = (await response.json()) as {
      daily_stats: unknown | null;
      equipped_accessories: unknown[];
      pet: unknown;
    };

    expect(body.pet).toEqual(expect.any(Object));
    expect(Array.isArray(body.equipped_accessories)).toBe(true);
  });
});
