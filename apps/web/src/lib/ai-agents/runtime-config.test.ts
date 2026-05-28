import { describe, expect, it } from 'vitest';
import {
  resolveAiAgentRedisUrl,
  resolveAiAgentWebhookOrigin,
} from './runtime-config';

describe('AI agent runtime config', () => {
  it('prefers explicit public webhook origins over request origins', () => {
    expect(
      resolveAiAgentWebhookOrigin({
        env: {
          NODE_ENV: 'production',
          WEB_APP_URL: 'https://tuturuuu.com',
        },
        requestOrigin: 'http://0.0.0.0:7803',
      })
    ).toBe('https://tuturuuu.com');
  });

  it('falls back to the public platform origin in production', () => {
    expect(
      resolveAiAgentWebhookOrigin({
        env: { NODE_ENV: 'production' },
        requestOrigin: 'http://0.0.0.0:7803',
      })
    ).toBe('https://tuturuuu.com');
  });

  it('normalizes local 0.0.0.0 origins in development', () => {
    expect(
      resolveAiAgentWebhookOrigin({
        env: { NODE_ENV: 'development' },
        requestOrigin: 'http://0.0.0.0:7803',
      })
    ).toBe('http://localhost:7803');
  });

  it('canonicalizes bare Tuturuuu deployment URLs to https origins', () => {
    expect(
      resolveAiAgentWebhookOrigin({
        env: {
          NODE_ENV: 'production',
          PLATFORM_BUILD_DEPLOYMENT_URL: 'tuturuuu.com',
        },
      })
    ).toBe('https://tuturuuu.com');
  });

  it('resolves Redis from root secret or explicit environment first', () => {
    expect(
      resolveAiAgentRedisUrl({
        env: { AI_AGENT_CHAT_SDK_STATE_REDIS_URL: 'redis://env:6379' },
        rootSecret: 'redis://secret:6379',
      })
    ).toBe('redis://secret:6379');

    expect(
      resolveAiAgentRedisUrl({
        env: { AI_AGENT_CHAT_SDK_STATE_REDIS_URL: 'redis://env:6379' },
      })
    ).toBe('redis://env:6379');
  });

  it('routes blue-green Docker runtimes to the bundled Redis service', () => {
    expect(
      resolveAiAgentRedisUrl({
        env: {
          PLATFORM_BLUE_GREEN_MONITORING_DIR: '/app/runtime/docker-web',
          UPSTASH_REDIS_REST_URL: 'http://serverless-redis-http:80',
        },
      })
    ).toBe('redis://redis:6379');
  });

  it('returns null when no durable Redis runtime is discoverable', () => {
    expect(resolveAiAgentRedisUrl({ env: {} })).toBeNull();
  });
});
