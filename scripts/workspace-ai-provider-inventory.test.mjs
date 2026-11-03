import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkProviderInventory,
  discoverProviderSites,
} from './workspace-ai-provider-inventory.mjs';

test('provider inventory covers system helpers, raw APIs, live tokens, memory and speech', () => {
  for (const source of [
    "import { google as model } from '@ai-sdk/google';",
    "const sdk = await import('@google/genai');",
    "import OpenAI from 'openai';",
    "import Anthropic from '@anthropic-ai/sdk';",
    "import Supermemory from 'supermemory';",
    "await env.AI.run('model', input);",
    "fetch('https://openrouter.ai/api/v1/chat/completions')",
    'await embedMany(input)',
    "fetch('https://api.openai.com/v1/audio/speech')",
  ])
    assert.deepEqual(
      discoverProviderSites({ 'apps/example/system.ts': source }),
      ['apps/example/system.ts']
    );
});
test('a new ungated provider site fails closed', () => {
  assert.match(
    checkProviderInventory(
      { 'apps/example/cron.ts': 'await generateText(input)' },
      []
    ).join('\n'),
    /unreviewed/
  );
});
test('an added call in a previously reviewed file fails closed', () => {
  assert.match(
    checkProviderInventory(
      { 'apps/example/cron.ts': 'await generateText(input)' },
      [
        {
          path: 'apps/example/cron.ts',
          sha256: 'old',
          workspace: 'fixture',
          boundaries: [],
        },
      ]
    ).join('\n'),
    /changed/
  );
});

test('the full provider census has reviewed, unchanged workspace boundaries', async () => {
  const { readFileSync } = await import('node:fs');
  const { readSources } = await import('./workspace-ai-provider-inventory.mjs');
  const inventory = JSON.parse(
    readFileSync(
      new URL('./workspace-ai-provider-inventory.json', import.meta.url),
      'utf8'
    )
  );
  assert.deepEqual(checkProviderInventory(readSources(), inventory), []);
});
