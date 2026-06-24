import { describe, expect, it, vi } from 'vitest';
import {
  abortInfrastructureStressTest,
  clearMobileDeploymentEnvKeyValue,
  clearMobileDeploymentScalarValue,
  clearMobileDeploymentSecret,
  createAIWhitelistDomain,
  createAIWhitelistEmail,
  createChatIntegration,
  deleteAIWhitelistDomain,
  deleteAIWhitelistEmail,
  deployAiAgentChannel,
  enableGitHubBotWatcherAutoPickup,
  getBlueGreenMonitoringRequestArchive,
  getCronMonitoringExecutionArchive,
  getCronMonitoringSnapshot,
  getGitHubBotState,
  getInfrastructureStressTestRun,
  getInfrastructureStressTestSnapshot,
  getMobileVersionPolicies,
  getObservabilityLogs,
  issueGitHubBotWatcherClient,
  listAIWhitelistDomains,
  listAIWhitelistEmails,
  listAiAgents,
  listAiGatewayModelRows,
  listAiGatewayModelRowsPage,
  listAiGatewayModelsPage,
  pauseAiAgentChannel,
  queueCronRun,
  queueInfrastructureStressTest,
  revokeGitHubBotWatcherClient,
  rotateAiAgentChannelSecret,
  saveAiAgent,
  saveAiAgentIdentityLink,
  saveGitHubBotConfiguration,
  saveMobileDeploymentEnvKeyValue,
  saveMobileDeploymentScalarValue,
  saveMobileDeploymentSecret,
  testAiAgentChannel,
  testGitHubBotConfiguration,
  updateAIWhitelistDomain,
  updateAIWhitelistEmail,
  updateCronMonitoringControl,
} from './infrastructure';

function createJsonResponse(data: unknown) {
  return {
    json: async () => data,
    ok: true,
    status: 200,
  };
}

function getCalledHeaders(fetchMock: ReturnType<typeof vi.fn>, callIndex = 0) {
  const init = fetchMock.mock.calls[callIndex]?.[1] as
    | { headers?: HeadersInit }
    | undefined;
  return new Headers(init?.headers);
}

describe('AI whitelist domain internal API helpers', () => {
  it('lists domains through the apps/web API with pagination filters', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ count: 0, data: [] }));

    await listAIWhitelistDomains(
      { page: 2, pageSize: 20, q: 'example.com' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/domains?page=2&pageSize=20&q=example.com',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('creates domains through the apps/web API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: {
          created_at: '2026-05-19T00:00:00Z',
          description: null,
          domain: 'example.com',
          enabled: true,
        },
      })
    );

    await createAIWhitelistDomain(
      {
        description: null,
        domain: 'example.com',
        enabled: true,
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/domains',
      expect.objectContaining({
        body: JSON.stringify({
          description: null,
          domain: 'example.com',
          enabled: true,
        }),
        method: 'POST',
      })
    );
  });

  it('updates and deletes domains through encoded apps/web API routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ success: true }));

    await updateAIWhitelistDomain(
      'example.com',
      { enabled: false },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await deleteAIWhitelistDomain('example.com', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/domain/example.com',
      expect.objectContaining({
        body: JSON.stringify({ enabled: false }),
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/domain/example.com',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });
});

describe('AI whitelist email internal API helpers', () => {
  it('lists emails through the apps/web API with pagination filters', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ count: 0, data: [] }));

    await listAIWhitelistEmails(
      { page: 2, pageSize: 20, q: 'person@example.com' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/emails?page=2&pageSize=20&q=person%40example.com',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('creates emails through the apps/web API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: {
          created_at: '2026-05-19T00:00:00Z',
          email: 'person@example.com',
          enabled: true,
        },
      })
    );

    await createAIWhitelistEmail(
      {
        email: 'person@example.com',
        enabled: true,
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/emails',
      expect.objectContaining({
        body: JSON.stringify({
          email: 'person@example.com',
          enabled: true,
        }),
        method: 'POST',
      })
    );
  });

  it('updates and deletes emails through encoded apps/web API routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ success: true }));

    await updateAIWhitelistEmail(
      'person@example.com',
      { enabled: false },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await deleteAIWhitelistEmail('person@example.com', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/person%40example.com',
      expect.objectContaining({
        body: JSON.stringify({ enabled: false }),
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/infrastructure/ai/whitelist/person%40example.com',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });
});

describe('AI gateway model internal API helpers', () => {
  it('lists raw model rows for filter options', async () => {
    const rawModel = {
      context_window: 1_000_000,
      description: 'Stable Flash Lite',
      id: 'google/gemini-3.1-flash-lite',
      is_enabled: true,
      name: 'Gemini 3.1 Flash Lite',
      provider: 'google',
      tags: ['thinking'],
      type: 'language',
    };
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse([rawModel]));

    const rows = await listAiGatewayModelRows(
      {
        type: 'all',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai/models?type=all',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    expect(rows).toEqual([rawModel]);
  });

  it('lists a searchable paginated model page through the apps/web API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: [
          {
            context_window: 1_000_000,
            description: 'Stable Flash Lite',
            id: 'google/gemini-3.1-flash-lite',
            is_enabled: true,
            name: 'Gemini 3.1 Flash Lite',
            provider: 'google',
            tags: ['thinking'],
          },
        ],
        pagination: { limit: 25, page: 2, total: 51 },
      })
    );

    const page = await listAiGatewayModelsPage(
      {
        enabled: true,
        ids: ['google/gemini-3.1-flash-lite'],
        limit: 25,
        page: 2,
        provider: 'google',
        q: 'flash',
        tag: 'thinking',
        type: 'language',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai/models?enabled=true&format=paginated&ids=google%2Fgemini-3.1-flash-lite&limit=25&page=2&provider=google&q=flash&tag=thinking&type=language',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    expect(page).toEqual({
      data: [
        {
          context: 1_000_000,
          description: 'Stable Flash Lite',
          disabled: false,
          label: 'Gemini 3.1 Flash Lite',
          provider: 'google',
          tags: ['thinking'],
          value: 'google/gemini-3.1-flash-lite',
        },
      ],
      pagination: { limit: 25, page: 2, total: 51 },
    });
  });

  it('lists raw paginated model rows for the public model directory', async () => {
    const rawModel = {
      context_window: 1_000_000,
      description: 'Stable Flash Lite',
      id: 'google/gemini-3.1-flash-lite',
      image_gen_price: null,
      input_price_per_token: 0.0000001,
      is_enabled: true,
      max_tokens: 8192,
      name: 'Gemini 3.1 Flash Lite',
      output_price_per_token: 0.0000004,
      provider: 'google',
      tags: ['thinking'],
      type: 'language',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: [rawModel],
        pagination: { limit: 60, page: 1, total: 1 },
      })
    );

    const page = await listAiGatewayModelRowsPage(
      {
        limit: 60,
        page: 1,
        type: 'all',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai/models?format=paginated&limit=60&page=1&type=all',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    expect(page).toEqual({
      data: [rawModel],
      pagination: { limit: 60, page: 1, total: 1 },
    });
  });
});

describe('mobile version internal API helpers', () => {
  it('loads mobile version policies through the infrastructure API', async () => {
    const payload = {
      android: {
        effectiveVersion: '1.2.0',
        minimumVersion: '1.0.0',
        otpEnabled: true,
        storeUrl: 'https://play.google.com/store/apps/details?id=app',
      },
      ios: {
        effectiveVersion: null,
        minimumVersion: null,
        otpEnabled: false,
        storeUrl: null,
      },
      webOtpEnabled: true,
    };
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse(payload));

    const result = await getMobileVersionPolicies({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/mobile-versions',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
    expect(result).toEqual(payload);
  });
});

describe('mobile deployment internal API helpers', () => {
  it('saves and clears env keys with the dedicated CSRF header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({}));

    await saveMobileDeploymentEnvKeyValue(
      'API_BASE_URL',
      'https://tuturuuu.com',
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await clearMobileDeploymentEnvKeyValue('API_BASE_URL', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/mobile-deployment',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'save_secret',
          kind: 'env',
          name: 'API_BASE_URL',
          value: 'https://tuturuuu.com',
        }),
        cache: 'no-store',
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/mobile-deployment',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'clear_secret',
          kind: 'env',
          name: 'API_BASE_URL',
        }),
        cache: 'no-store',
        method: 'PUT',
      })
    );

    const saveHeaders = getCalledHeaders(fetchMock);
    const clearHeaders = getCalledHeaders(fetchMock, 1);
    expect(saveHeaders.get('Content-Type')).toBe('application/json');
    expect(saveHeaders.get('x-tuturuuu-mobile-deployment-action')).toBe('1');
    expect(clearHeaders.get('x-tuturuuu-mobile-deployment-action')).toBe('1');
  });

  it('saves and clears scalar keys with the dedicated CSRF header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({}));

    await saveMobileDeploymentScalarValue('ANDROID_KEYSTORE_ALIAS', 'upload', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await clearMobileDeploymentScalarValue('ANDROID_KEYSTORE_ALIAS', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/mobile-deployment',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'save_secret',
          kind: 'scalar',
          name: 'ANDROID_KEYSTORE_ALIAS',
          value: 'upload',
        }),
        cache: 'no-store',
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/mobile-deployment',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'clear_secret',
          kind: 'scalar',
          name: 'ANDROID_KEYSTORE_ALIAS',
        }),
        cache: 'no-store',
        method: 'PUT',
      })
    );

    expect(
      getCalledHeaders(fetchMock).get('x-tuturuuu-mobile-deployment-action')
    ).toBe('1');
    expect(
      getCalledHeaders(fetchMock, 1).get('x-tuturuuu-mobile-deployment-action')
    ).toBe('1');
  });

  it('saves custom env key renames through the unified secret helper', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({}));

    await saveMobileDeploymentSecret(
      {
        kind: 'env',
        name: 'NEW_API_BASE_URL',
        previousName: 'API_BASE_URL',
        value: 'https://tuturuuu.com',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await clearMobileDeploymentSecret(
      { kind: 'env', name: 'NEW_API_BASE_URL' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/mobile-deployment',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'save_secret',
          kind: 'env',
          name: 'NEW_API_BASE_URL',
          previousName: 'API_BASE_URL',
          value: 'https://tuturuuu.com',
        }),
        cache: 'no-store',
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/mobile-deployment',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'clear_secret',
          kind: 'env',
          name: 'NEW_API_BASE_URL',
        }),
        cache: 'no-store',
        method: 'PUT',
      })
    );
  });
});

describe('GitHub bot internal API helpers', () => {
  it('loads redacted GitHub bot state through the infrastructure API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        auditEvents: [],
        clients: [],
        configuration: null,
      })
    );

    await getGitHubBotState({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/github-bot',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('saves GitHub bot configuration with the dedicated CSRF header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        auditEvents: [],
        clients: [],
        configuration: null,
      })
    );
    const payload = {
      appId: '12345',
      enabled: true,
      installationId: '67890',
      privateKey:
        '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
      repositoryName: 'platform',
      repositoryOwner: 'tutur3u',
    };

    await saveGitHubBotConfiguration(payload, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/github-bot',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'PUT',
      })
    );
    const headers = getCalledHeaders(fetchMock);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('x-tuturuuu-github-bot-action')).toBe('1');
  });

  it('tests, enables auto-pickup, issues, and revokes GitHub bot watcher clients', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        autoPickup: {
          clientId: 'client-auto',
          expiresAt: '2026-09-09T00:00:00.000Z',
          queuedAt: '2026-06-11T00:00:00.000Z',
          tokenEndpointUrl:
            'https://internal.example.com/api/v1/infrastructure/github-bot/installation-token',
        },
        state: {
          auditEvents: [],
          clients: [],
          configuration: null,
        },
        token: 'ttr_github_bot_generated',
        validation: {
          ok: true,
          validatedAt: '2026-06-11T00:00:00.000Z',
        },
      })
    );

    await testGitHubBotConfiguration({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await enableGitHubBotWatcherAutoPickup({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await issueGitHubBotWatcherClient(
      { expiresInDays: 30, name: 'Watcher' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await revokeGitHubBotWatcherClient('client/id', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/infrastructure/github-bot/test',
      expect.objectContaining({
        body: '{}',
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/infrastructure/github-bot/auto-pickup',
      expect.objectContaining({
        body: '{}',
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/infrastructure/github-bot/clients',
      expect.objectContaining({
        body: JSON.stringify({ expiresInDays: 30, name: 'Watcher' }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/infrastructure/github-bot/clients/client%2Fid',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );

    for (const callIndex of [0, 1, 2, 3]) {
      expect(
        getCalledHeaders(fetchMock, callIndex).get(
          'x-tuturuuu-github-bot-action'
        )
      ).toBe('1');
    }
  });
});

describe('observability internal API helpers', () => {
  it('sends grouped log filters through the apps/web observability API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        facets: {
          levels: [],
          routes: [],
          sources: [],
          statuses: [],
          users: [],
        },
        hasNextPage: false,
        items: [],
        page: 2,
        pageSize: 25,
        total: 0,
      })
    );

    await getObservabilityLogs(
      {
        deploymentStamp: 'deploy-123',
        level: 'error',
        page: 2,
        pageSize: 25,
        projectId: 'platform',
        q: 'sample resources',
        requestId: 'req-123',
        route: '/api/cron/infrastructure/sample-resources',
        since: 1710000000000,
        source: 'api',
        status: '2xx',
        timeframeHours: 6,
        until: Date.parse('2026-05-04T01:02:03.000Z'),
        user: 'operator@example.com',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/observability/logs?page=2&pageSize=25&projectId=platform&timeframeHours=6&q=sample+resources&route=%2Fapi%2Fcron%2Finfrastructure%2Fsample-resources&requestId=req-123&user=operator%40example.com&deploymentStamp=deploy-123&since=1710000000000&until=1777856523000&level=error&source=api&status=2xx',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('passes blue-green request archive cursor params through the apps/web API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        analytics: {
          averageLatencyMs: null,
          distinctRoutes: 0,
          errorRequestCount: 0,
          externalRequestCount: 0,
          internalRequestCount: 0,
          requestCount: 0,
          retainedRequestCount: 0,
          rscRequestCount: 0,
          statusCodes: [],
          timeframe: {
            days: 7,
            endAt: 0,
            startAt: 0,
          },
          topRoutes: [],
        },
        hasNextPage: false,
        hasPreviousPage: false,
        items: [],
        limit: 25,
        offset: 0,
        page: 1,
        pageCount: 1,
        total: 0,
        window: {
          newestAt: null,
          oldestAt: null,
        },
      })
    );

    await getBlueGreenMonitoringRequestArchive(
      {
        page: 1,
        pageSize: 25,
        q: 'login',
        render: 'rsc',
        route: '/login',
        since: 1710000000000,
        status: '5xx',
        traffic: 'external',
        until: Date.parse('2026-05-04T01:02:03.000Z'),
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/monitoring/blue-green/requests?page=1&pageSize=25&q=login&status=5xx&route=%2Flogin&since=1710000000000&render=rsc&traffic=external&until=1777856523000',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('loads cron monitoring snapshots through the monitoring API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        control: { enabled: true, jobs: {}, updatedAt: null },
        enabled: true,
        jobs: [],
        lastExecution: null,
        nextRunAt: null,
        overview: {
          enabledJobs: 0,
          failedExecutions: 0,
          failedJobs: 0,
          processingRuns: 0,
          queuedRuns: 0,
          retainedExecutions: 0,
          totalJobs: 0,
        },
        retainedExecutionCount: 0,
        runs: [],
        source: {
          configAvailable: true,
          controlAvailable: true,
          runtimeDirAvailable: true,
          statusAvailable: true,
        },
        status: 'live',
        updatedAt: null,
      })
    );

    await getCronMonitoringSnapshot({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/monitoring/cron',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('passes cron execution archive filters through the monitoring API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        hasNextPage: false,
        hasPreviousPage: false,
        items: [],
        limit: 25,
        offset: 25,
        page: 2,
        pageCount: 1,
        total: 0,
        window: {
          newestAt: null,
          oldestAt: null,
        },
      })
    );

    await getCronMonitoringExecutionArchive(
      {
        jobId: 'daily-report',
        page: 2,
        pageSize: 25,
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/monitoring/cron/executions?page=2&pageSize=25&jobId=daily-report',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('queues cron runs and updates cron controls through JSON mutations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({}));

    await queueCronRun(
      { jobId: 'daily-report' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await updateCronMonitoringControl(
      { enabled: false, jobId: 'daily-report' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/infrastructure/monitoring/cron/run',
      expect.objectContaining({
        body: JSON.stringify({ jobId: 'daily-report' }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(getCalledHeaders(fetchMock).get('Content-Type')).toBe(
      'application/json'
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/infrastructure/monitoring/cron/control',
      expect.objectContaining({
        body: JSON.stringify({ enabled: false, jobId: 'daily-report' }),
        cache: 'no-store',
        method: 'PUT',
      })
    );
    expect(getCalledHeaders(fetchMock, 1).get('Content-Type')).toBe(
      'application/json'
    );
  });

  it('loads stress-test snapshots through the monitoring API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        activeRun: null,
        canManage: false,
        profiles: [],
        recentRuns: [],
        targets: [],
      })
    );

    await getInfrastructureStressTestSnapshot({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/monitoring/stress-tests',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('queues stress tests and reads encoded run details', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({}));

    await queueInfrastructureStressTest(
      {
        concurrency: 8,
        durationSeconds: 60,
        maxRequestsPerSecond: 20,
        path: '/login',
        profileId: 'smoke',
        targetId: 'platform-web',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    await getInfrastructureStressTestRun('run 1/alpha', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/infrastructure/monitoring/stress-tests',
      expect.objectContaining({
        body: JSON.stringify({
          concurrency: 8,
          durationSeconds: 60,
          maxRequestsPerSecond: 20,
          path: '/login',
          profileId: 'smoke',
          targetId: 'platform-web',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(getCalledHeaders(fetchMock).get('Content-Type')).toBe(
      'application/json'
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/infrastructure/monitoring/stress-tests/run%201%2Falpha',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('aborts stress tests through encoded run routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({}));

    await abortInfrastructureStressTest(
      'run 1/alpha',
      { reason: 'operator abort' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/monitoring/stress-tests/run%201%2Falpha/abort',
      expect.objectContaining({
        body: JSON.stringify({ reason: 'operator abort' }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(getCalledHeaders(fetchMock).get('Content-Type')).toBe(
      'application/json'
    );
  });
});

describe('AI agent internal API helpers', () => {
  it('lists AI agents through the apps/web infrastructure API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ agents: [], identities: [] }));

    await listAiAgents({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai-agents',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      })
    );
  });

  it('saves AI agent registry payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        agent: { channels: [], id: 'support' },
      })
    );
    const payload = {
      enabled: true,
      id: 'support',
      name: 'Support Agent',
    };

    await saveAiAgent(payload, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai-agents',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('creates managed chat integrations through the AI agent API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        agent: { channels: [], id: 'chat-integrations' },
        channel: { id: 'chat-zalo-personal' },
        conversationId: 'ai-agent-1234',
      })
    );
    const payload = {
      displayName: 'Personal Zalo',
      kind: 'zalo-personal' as const,
    };

    await createChatIntegration(payload, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai-agents/chat-integrations',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('routes deploy, pause, test, and rotate actions through encoded paths', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ ok: true, response: 'ok' }));

    await deployAiAgentChannel('agent/id', 'discord/main', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await pauseAiAgentChannel('agent/id', 'discord/main', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await testAiAgentChannel('agent/id', 'discord/main', 'ping', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });
    await rotateAiAgentChannelSecret(
      'agent/id',
      'zalo/main',
      'webhookSecret',
      undefined,
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/infrastructure/ai-agents/agent%2Fid/deploy',
      expect.objectContaining({
        body: JSON.stringify({ channelId: 'discord/main' }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/infrastructure/ai-agents/agent%2Fid/pause',
      expect.objectContaining({
        body: JSON.stringify({ channelId: 'discord/main' }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/infrastructure/ai-agents/agent%2Fid/test',
      expect.objectContaining({
        body: JSON.stringify({ channelId: 'discord/main', prompt: 'ping' }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://internal.example.com/api/v1/infrastructure/ai-agents/agent%2Fid/channels/zalo%2Fmain/secrets',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'webhookSecret',
          value: undefined,
        }),
        method: 'POST',
      })
    );
  });

  it('saves Zalo identity links through the AI agent API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        identity: { platformUserId: 'platform-user-1' },
      })
    );
    const payload = {
      externalUserId: 'zalo-user-1',
      platformUserId: 'platform-user-1',
      provider: 'zalo' as const,
      providerAccountId: 'oa-1',
      workspaceId: 'workspace-1',
    };

    await saveAiAgentIdentityLink(payload, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/infrastructure/ai-agents/identities',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });
});
