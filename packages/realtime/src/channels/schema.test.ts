import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { channelServerFrameSchema } from './schema';

const cases = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../fixtures/channel-server-frames.json'),
    'utf8'
  )
) as { name: string; valid: boolean; frame: unknown }[];
it.each(cases)('web wire contract: $name', ({ frame, valid }) => {
  expect(channelServerFrameSchema.safeParse(frame).success).toBe(valid);
});
