import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDecision } from './publish.mjs';

test('passes nonempty option descriptions and multiline bodies through', () => {
  const raw = {
    id: 'description',
    title: 'Choose',
    createdAt: new Date().toISOString(),
    options: [
      { id: 'one', label: 'One', description: 'First https://example.com' },
      { id: 'two', label: 'Two', description: 'https://example.com' },
    ],
    body: '**Context**\n\n- item `code`\n1. item',
  };
  const parsed = parseDecision(raw);
  assert.equal(parsed.options[0].description, 'First');
  assert.ok(!('description' in parsed.options[1]));
  assert.equal(parsed.body, raw.body);
});
