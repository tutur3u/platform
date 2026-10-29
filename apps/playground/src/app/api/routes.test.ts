import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateObject = vi.fn();
const withAiMemory = vi.fn();
const google = vi.fn();

vi.mock('@ai-sdk/google', () => ({
  google: (...args: unknown[]) => google(...args),
}));
vi.mock('@tuturuuu/ai/core', () => ({
  generateObject: (...args: unknown[]) => generateObject(...args),
}));
vi.mock('@tuturuuu/ai/memory', () => ({
  withAiMemory: (...args: unknown[]) => withAiMemory(...args),
}));

const objectGeneration = await import('./ai/object-generation/route');
const toolCalling = await import('./ai/tool-calling/route');
const buildInfo = await import('./build-info/route');
const { ROOT_WORKSPACE_ID } = await import('@tuturuuu/utils/constants');

const HTTP_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

describe('playground API route contracts', () => {
  beforeEach(() => {
    generateObject.mockReset();
    withAiMemory.mockReset();
    google.mockReset();
  });

  it.each([
    ['object-generation', objectGeneration],
    ['tool-calling', toolCalling],
    ['build-info', buildInfo],
  ])('%s exposes only GET', (_name, mod) => {
    expect(typeof mod.GET).toBe('function');
    for (const method of HTTP_METHODS) {
      expect(mod).not.toHaveProperty(method);
    }
  });

  it('tool-calling returns an empty JSON object without side effects', async () => {
    const res = await toolCalling.GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    await expect(res.json()).resolves.toEqual({});
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('build-info returns uncached JSON for the playground app', async () => {
    const res = buildInfo.GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    );
    expect(res.headers.get('cache-control')).toBe('no-store, max-age=0');
    const body = await res.json();
    expect(body).toEqual(expect.any(Object));
    expect(JSON.stringify(body)).not.toMatch(/SECRET|PRIVATE_KEY|TOKEN=/i);
  });

  it('object-generation takes no request input and runs a fixed server prompt', async () => {
    expect(objectGeneration.GET.length).toBe(0);

    const model = { id: 'fake-model' };
    const wrapped = { id: 'fake-wrapped-model' };
    google.mockReturnValue(model);
    withAiMemory.mockResolvedValue(wrapped);
    generateObject.mockResolvedValue({
      object: { tasks: [{ internalReasoning: 'fake reasoning', name: 'x' }] },
    });

    const res = await objectGeneration.GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      tasks: [{ internalReasoning: 'fake reasoning', name: 'x' }],
    });
    expect(google).toHaveBeenCalledWith('gemini-2.5-flash-lite');
    expect(withAiMemory).toHaveBeenCalledWith({
      customId: 'playground-object-generation',
      model,
      product: 'playground',
      source: 'playground_object_generation',
      surface: 'playground_object_generation',
      userId: ROOT_WORKSPACE_ID,
      wsId: ROOT_WORKSPACE_ID,
    });
    expect(generateObject).toHaveBeenCalledTimes(1);
    const [call] = generateObject.mock.calls[0] ?? [];
    expect(call.model).toBe(wrapped);
    expect(call.prompt).toEqual(expect.any(String));
    expect(call.system).toEqual(expect.any(String));
    expect(call).not.toHaveProperty('tools');
  });

  it('object-generation validates model output against the task schema', async () => {
    google.mockReturnValue({});
    withAiMemory.mockResolvedValue({});
    generateObject.mockResolvedValue({ object: { tasks: [] } });

    await objectGeneration.GET();

    const [call] = generateObject.mock.calls[0] ?? [];
    const schema = call.schema;
    expect(
      schema.safeParse({
        tasks: [{ internalReasoning: 'long enough', name: 'ok', type: 'task' }],
      }).success
    ).toBe(true);
    expect(
      schema.safeParse({
        tasks: [{ internalReasoning: 'short', name: 'ok', type: 'shell' }],
      }).success
    ).toBe(false);
  });

  it('object-generation surfaces provider failures as errors', async () => {
    google.mockReturnValue({});
    withAiMemory.mockResolvedValue({});
    generateObject.mockRejectedValue(new Error('provider unavailable'));

    await expect(objectGeneration.GET()).rejects.toThrow(
      'provider unavailable'
    );
  });
});
