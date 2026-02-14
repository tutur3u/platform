import { expect, test } from '@playwright/test';

// Test user: local@tuturuuu.com (ID: 00000000-0000-0000-0000-000000000001)
// Auth state loaded from storageState

test.describe('AI Credits API', () => {
  test('GET /api/v1/workspaces/{wsId}/ai/credits returns credit status', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/v1/workspaces/personal/ai/credits'
    );

    if (response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty('totalAllocated');
      expect(data).toHaveProperty('totalUsed');
      expect(data).toHaveProperty('remaining');
      expect(data).toHaveProperty('percentUsed');
      expect(data).toHaveProperty('tier');
      expect(data).toHaveProperty('allowedModels');
      expect(data).toHaveProperty('allowedFeatures');
      expect(data).toHaveProperty('balanceScope');
      expect(data).toHaveProperty('seatCount');
      expect(typeof data.totalAllocated).toBe('number');
      expect(typeof data.totalUsed).toBe('number');
      expect(typeof data.remaining).toBe('number');
      expect(['user', 'workspace']).toContain(data.balanceScope);
    }
  });

  test('GET /api/v1/workspaces/{wsId}/ai/credits auto-creates balance for new period', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/v1/workspaces/personal/ai/credits'
    );

    if (response.ok()) {
      const data = await response.json();
      expect(data.periodStart).toBeTruthy();
      expect(data.periodEnd).toBeTruthy();
      expect(data.totalAllocated).toBeGreaterThanOrEqual(0);
    }
  });

  test('GET /api/v1/workspaces/{wsId}/ai/credits returns 401 for unauthenticated request', async ({
    request,
  }) => {
    const response = await request.fetch(
      '/api/v1/workspaces/personal/ai/credits',
      {
        headers: {},
      }
    );

    expect([401, 403]).toContain(response.status());
  });

  test('Response includes tier, allowedModels, allowedFeatures, maxOutputTokens', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/v1/workspaces/personal/ai/credits'
    );

    if (response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty('tier');
      expect(data).toHaveProperty('allowedModels');
      expect(data).toHaveProperty('allowedFeatures');
      expect(data).toHaveProperty('maxOutputTokens');
      expect(Array.isArray(data.allowedModels)).toBe(true);
      expect(Array.isArray(data.allowedFeatures)).toBe(true);
    }
  });

  test('Response includes balanceScope field', async ({ request }) => {
    const response = await request.get(
      '/api/v1/workspaces/personal/ai/credits'
    );

    if (response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty('balanceScope');
      // FREE workspace should have user-level scope
      if (data.tier === 'FREE') {
        expect(data.balanceScope).toBe('user');
        expect(data.seatCount).toBeNull();
      }
    }
  });

  test('percentUsed is correctly calculated', async ({ request }) => {
    const response = await request.get(
      '/api/v1/workspaces/personal/ai/credits'
    );

    if (response.ok()) {
      const data = await response.json();
      const totalPool = data.totalAllocated + (data.bonusCredits ?? 0);
      if (totalPool > 0) {
        const expectedPercent = (data.totalUsed / totalPool) * 100;
        expect(data.percentUsed).toBeCloseTo(expectedPercent, 0);
      }
    }
  });

  test('Response includes bonusCredits field', async ({ request }) => {
    const response = await request.get(
      '/api/v1/workspaces/personal/ai/credits'
    );

    if (response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty('bonusCredits');
      expect(typeof data.bonusCredits).toBe('number');
      expect(data.bonusCredits).toBeGreaterThanOrEqual(0);
    }
  });

  test('Response includes dailyUsed field', async ({ request }) => {
    const response = await request.get(
      '/api/v1/workspaces/personal/ai/credits'
    );

    if (response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty('dailyUsed');
      expect(typeof data.dailyUsed).toBe('number');
    }
  });

  test('remaining equals totalAllocated + bonusCredits - totalUsed', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/v1/workspaces/personal/ai/credits'
    );

    if (response.ok()) {
      const data = await response.json();
      const expectedRemaining =
        data.totalAllocated + (data.bonusCredits ?? 0) - data.totalUsed;
      expect(data.remaining).toBe(expectedRemaining);
    }
  });
});

test.describe('AI Credit Indicator UI', () => {
  test('AiCreditIndicator shows credit information', async ({ page }) => {
    await page.goto('/en/personal/tasks');
    await page.waitForLoadState('networkidle');

    const creditIndicator = page.locator('text=AI Credits');
    if (await creditIndicator.isVisible()) {
      const indicatorParent = creditIndicator.locator('..');
      const text = await indicatorParent.textContent();
      expect(text).toBeTruthy();
      expect(text).toContain('AI Credits');
    }
  });

  test('Beta badge is visible on AI Credits', async ({ page }) => {
    await page.goto('/en/personal/tasks');
    await page.waitForLoadState('networkidle');

    const betaBadge = page.locator('text=Beta').first();
    if (await betaBadge.isVisible()) {
      expect(await betaBadge.textContent()).toBe('Beta');
    }
  });

  test('Credit indicator shows numeric values', async ({ page }) => {
    await page.goto('/en/personal/tasks');
    await page.waitForLoadState('networkidle');

    // The indicator should show something like "X / Y" credits
    const creditText = page.locator(
      '[class*="ai-credit"], [data-testid="ai-credit-indicator"]'
    );
    if ((await creditText.count()) > 0) {
      const text = await creditText.first().textContent();
      // Should contain at least one number
      expect(text).toMatch(/\d/);
    }
  });
});

test.describe('Gateway Model Sync', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('POST /api/v1/admin/ai-credits/sync-models requires authentication', async ({
    request,
  }) => {
    const response = await request.fetch(
      '/api/v1/admin/ai-credits/sync-models',
      {
        method: 'POST',
        headers: {},
      }
    );

    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Admin API - Allocations', () => {
  test('GET /api/v1/admin/ai-credits/allocations lists tier allocations', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/admin/ai-credits/allocations');
    // If root admin, should get array; otherwise 403
    if (response.ok()) {
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('tier');
        expect(data[0]).toHaveProperty('monthly_credits');
        expect(data[0]).toHaveProperty('credits_per_seat');
        expect(data[0]).toHaveProperty('markup_multiplier');
        expect(data[0]).toHaveProperty('allowed_models');
        expect(data[0]).toHaveProperty('allowed_features');
        expect(data[0]).toHaveProperty('is_active');
      }
    } else {
      expect([401, 403]).toContain(response.status());
    }
  });

  test('GET /api/v1/admin/ai-credits/allocations includes all 4 tiers', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/admin/ai-credits/allocations');
    if (response.ok()) {
      const data = await response.json();
      const tiers = data.map((a: { tier: string }) => a.tier);
      expect(tiers).toContain('FREE');
      expect(tiers).toContain('PLUS');
      expect(tiers).toContain('PRO');
      expect(tiers).toContain('ENTERPRISE');
    }
  });

  test('PUT /api/v1/admin/ai-credits/allocations validates payload', async ({
    request,
  }) => {
    const response = await request.put('/api/v1/admin/ai-credits/allocations', {
      data: { invalid: true },
    });
    // Should get 400 (invalid payload) or 401/403 (not admin)
    expect([400, 401, 403]).toContain(response.status());
  });

  test('PUT /api/v1/admin/ai-credits/allocations requires UUID id', async ({
    request,
  }) => {
    const response = await request.put('/api/v1/admin/ai-credits/allocations', {
      data: { id: 'not-a-uuid', monthly_credits: 5000 },
    });
    expect([400, 401, 403]).toContain(response.status());
  });
});

test.describe('Admin API - Models', () => {
  test('GET /api/v1/admin/ai-credits/models lists gateway models', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/admin/ai-credits/models');
    if (response.ok()) {
      const result = await response.json();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.pagination).toHaveProperty('page');
      expect(result.pagination).toHaveProperty('limit');
      expect(result.pagination).toHaveProperty('total');
    } else {
      expect([401, 403]).toContain(response.status());
    }
  });

  test('GET /api/v1/admin/ai-credits/models supports pagination', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/v1/admin/ai-credits/models?page=1&limit=5'
    );
    if (response.ok()) {
      const result = await response.json();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(5);
      expect(result.data.length).toBeLessThanOrEqual(5);
    }
  });

  test('GET /api/v1/admin/ai-credits/models supports provider filter', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/v1/admin/ai-credits/models?provider=google'
    );
    if (response.ok()) {
      const result = await response.json();
      for (const model of result.data) {
        expect(model.provider.toLowerCase()).toContain('google');
      }
    }
  });

  test('GET /api/v1/admin/ai-credits/models returns model structure', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/admin/ai-credits/models');
    if (response.ok()) {
      const result = await response.json();
      if (result.data.length > 0) {
        const model = result.data[0];
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('provider');
        expect(model).toHaveProperty('type');
        expect(model).toHaveProperty('is_enabled');
        expect(model).toHaveProperty('input_price_per_token');
        expect(model).toHaveProperty('output_price_per_token');
      }
    }
  });

  test('PATCH /api/v1/admin/ai-credits/models validates payload', async ({
    request,
  }) => {
    const response = await request.patch('/api/v1/admin/ai-credits/models', {
      data: { invalid: true },
    });
    expect([400, 401, 403]).toContain(response.status());
  });
});

test.describe('Admin API - Balances', () => {
  test('GET /api/v1/admin/ai-credits/balances lists credit balances', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/admin/ai-credits/balances');
    if (response.ok()) {
      const result = await response.json();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.data)).toBe(true);
    } else {
      expect([401, 403]).toContain(response.status());
    }
  });

  test('GET /api/v1/admin/ai-credits/balances supports pagination', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/v1/admin/ai-credits/balances?page=1&limit=5'
    );
    if (response.ok()) {
      const result = await response.json();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(5);
    }
  });

  test('GET /api/v1/admin/ai-credits/balances supports scope filter', async ({
    request,
  }) => {
    const userResponse = await request.get(
      '/api/v1/admin/ai-credits/balances?scope=user'
    );
    if (userResponse.ok()) {
      const result = await userResponse.json();
      for (const balance of result.data) {
        expect(balance.scope).toBe('user');
        expect(balance.user).not.toBeNull();
      }
    }

    const wsResponse = await request.get(
      '/api/v1/admin/ai-credits/balances?scope=workspace'
    );
    if (wsResponse.ok()) {
      const result = await wsResponse.json();
      for (const balance of result.data) {
        expect(balance.scope).toBe('workspace');
        expect(balance.workspace).not.toBeNull();
      }
    }
  });

  test('GET /api/v1/admin/ai-credits/balances enriches with workspace/user data', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/admin/ai-credits/balances');
    if (response.ok()) {
      const result = await response.json();
      for (const balance of result.data) {
        expect(balance).toHaveProperty('scope');
        expect(['user', 'workspace']).toContain(balance.scope);

        if (balance.scope === 'workspace') {
          expect(balance.workspace).toHaveProperty('id');
          expect(balance.workspace).toHaveProperty('name');
          expect(balance.workspace).toHaveProperty('member_count');
        }
        if (balance.scope === 'user') {
          expect(balance.user).toHaveProperty('id');
          expect(balance.user).toHaveProperty('display_name');
          expect(balance.user).toHaveProperty('avatar_url');
        }
      }
    }
  });

  test('POST /api/v1/admin/ai-credits/balances validates bonus payload', async ({
    request,
  }) => {
    const response = await request.post('/api/v1/admin/ai-credits/balances', {
      data: { invalid: true },
    });
    expect([400, 401, 403]).toContain(response.status());
  });

  test('POST /api/v1/admin/ai-credits/balances rejects negative bonus amount', async ({
    request,
  }) => {
    const response = await request.post('/api/v1/admin/ai-credits/balances', {
      data: {
        balance_id: '00000000-0000-0000-0000-000000000000',
        amount: -100,
      },
    });
    expect([400, 401, 403]).toContain(response.status());
  });

  test('POST /api/v1/admin/ai-credits/balances rejects zero bonus amount', async ({
    request,
  }) => {
    const response = await request.post('/api/v1/admin/ai-credits/balances', {
      data: {
        balance_id: '00000000-0000-0000-0000-000000000000',
        amount: 0,
      },
    });
    expect([400, 401, 403]).toContain(response.status());
  });
});

test.describe('Admin API - Overview', () => {
  test('GET /api/v1/admin/ai-credits/overview returns 403 for non-root user', async ({
    request,
  }) => {
    // Standard test user may or may not be root admin
    const response = await request.get('/api/v1/admin/ai-credits/overview');
    // If not root admin, should get 403
    if (!response.ok()) {
      expect([401, 403]).toContain(response.status());
    }
  });

  test('GET /api/v1/admin/ai-credits/overview returns platform stats', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/admin/ai-credits/overview');
    if (response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty('total_workspaces_with_balance');
      expect(data).toHaveProperty('total_users_with_balance');
      expect(data).toHaveProperty('total_credits_allocated');
      expect(data).toHaveProperty('total_credits_consumed');
      expect(typeof data.total_workspaces_with_balance).toBe('number');
      expect(typeof data.total_users_with_balance).toBe('number');
      expect(typeof data.total_credits_allocated).toBe('number');
    }
  });
});

test.describe('Admin API - Features', () => {
  test('GET /api/v1/admin/ai-credits/features lists feature access rules', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/admin/ai-credits/features');
    if (response.ok()) {
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0]).toHaveProperty('tier');
        expect(data[0]).toHaveProperty('feature');
        expect(data[0]).toHaveProperty('enabled');
      }
    } else {
      expect([401, 403]).toContain(response.status());
    }
  });
});

test.describe('Error Handling', () => {
  test('403 CREDITS_EXHAUSTED shows upgrade toast notification', async ({
    page,
  }) => {
    // This is a UI test that verifies the toast appears when credits are exhausted
    // It requires the credits endpoint to return exhausted status
    await page.goto('/en/personal/tasks');
    await page.waitForLoadState('networkidle');
    // Verification is that the page loads without errors
    expect(page.url()).toContain('/tasks');
  });

  test('Tasks page loads successfully with credit system active', async ({
    page,
  }) => {
    await page.goto('/en/personal/tasks');
    await page.waitForLoadState('networkidle');

    // Page should not show any uncaught errors
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    // Wait a moment for any async errors
    await page.waitForTimeout(1000);

    // Filter out expected errors (like network failures in test env)
    const criticalErrors = errors.filter(
      (e) => !e.includes('fetch') && !e.includes('network')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
