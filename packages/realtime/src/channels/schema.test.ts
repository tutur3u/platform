import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { channelServerFrameSchema } from './schema';

const cases = JSON.parse(
  readFileSync(
    new URL('../../fixtures/channel-server-frames.json', import.meta.url),
    'utf8'
  )
) as { name: string; valid: boolean; frame: unknown }[];
it.each(cases)('web wire contract: $name', ({ frame, valid }) => {
  expect(channelServerFrameSchema.safeParse(frame).success).toBe(valid);
});
