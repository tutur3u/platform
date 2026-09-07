import { APICallError } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateMeetArtifact } from './gemini';

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: mocks.generateText,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  mocks.generateText.mockReset();
});

describe('Meet generation error boundary', () => {
  it('reports missing configuration without contacting the provider', async () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', '');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      generateMeetArtifact({ transcript: 'Synthetic test' })
    ).rejects.toMatchObject({ status: 500 });
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('Meet AI generation failed', {
      reason: 'missing_configuration',
      providerStatus: null,
    });
  });
  it('reports internal failures separately without exposing their details', async () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'synthetic-test-key');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.generateText.mockRejectedValue(
      new TypeError('sensitive-internal-detail')
    );
    await expect(
      generateMeetArtifact({ transcript: 'Synthetic test' })
    ).rejects.toMatchObject({
      status: 500,
      reason: 'runtime_error',
      message: 'Meeting AI processing failed',
    });
    expect(log).toHaveBeenCalledWith('Meet AI generation failed', {
      reason: 'runtime_error',
      providerStatus: null,
    });
  });
  it('unwraps provider failure with fixed diagnostics and no provider details', async () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'synthetic-test-key');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.generateText.mockRejectedValue(
      new APICallError({
        message: 'API key not valid: sensitive-detail',
        url: 'https://example.invalid',
        requestBodyValues: {},
        statusCode: 400,
      })
    );
    await expect(
      generateMeetArtifact({ transcript: 'Synthetic test' })
    ).rejects.toMatchObject({
      status: 502,
      reason: 'invalid_api_key',
      providerStatus: 400,
      message: 'Meeting AI provider request failed',
    });
    expect(log).toHaveBeenCalledWith('Meet AI generation failed', {
      reason: 'invalid_api_key',
      providerStatus: 400,
    });
  });
});
