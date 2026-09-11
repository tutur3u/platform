import { seedRecords } from '@tuturuuu/multiplayer';
import { afterEach, expect, it, vi } from 'vitest';
import type { Env } from './env';
import { executeImageTool } from './image-tool';

afterEach(() => vi.unstubAllGlobals());
it('saves actual image output as Markdown without exposing base64 in the trace', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json(
        {
          id: 'image-request',
          data: [{ b64_json: 'AAAA', media_type: 'image/png' }],
          tuturuuu: { run_id: 'image-ledger', billing: { billedCredits: 4 } },
        },
        {
          headers: {
            'x-colab-sponsor-workspace': '00000000-0000-0000-0000-000000000000',
          },
        }
      )
    )
  );
  const store = vi.fn().mockResolvedValue('/api/rooms/room/images/image');
  const env = {
    COLAB_AI_API_KEY: 'test-key',
    sponsorship: { jobId: 'job', operation: 'run', sequence: 0, receipts: [] },
    storeGeneratedImage: store,
  } as unknown as Env;
  const records = seedRecords();
  const output = await executeImageTool(env, records, {
    tool: 'generate_image',
    app: 'figma',
    prompt: 'Four abstract pathways',
    title: 'Concept',
    alt: 'Four paths',
  });
  expect(store).toHaveBeenCalledWith({ base64: 'AAAA', mimeType: 'image/png' });
  expect(output).not.toContain('AAAA');
  expect(records.at(-1)?.content).toContain(
    '![Four paths](/api/rooms/room/images/image)'
  );
  expect(env.sponsorship?.receipts).toEqual([
    { requestId: 'image-request', runId: 'image-ledger', credits: 4 },
  ]);
});
it('does not claim to generate images without the configured service', async () => {
  await expect(
    executeImageTool({} as Env, [], { app: 'figma', prompt: 'Artwork' })
  ).rejects.toThrow('image_unavailable');
});
