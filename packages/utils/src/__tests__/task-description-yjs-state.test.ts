import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveTaskDescriptionYjsState } from '../yjs-task-description';

const fullFeaturedDescription = readFileSync(
  join(
    process.cwd(),
    'src',
    '__tests__',
    'fixtures',
    'task-description-full-featured.json'
  ),
  'utf8'
);

describe('deriveTaskDescriptionYjsState', () => {
  it('returns null for empty descriptions', () => {
    expect(deriveTaskDescriptionYjsState(null)).toBeNull();
    expect(deriveTaskDescriptionYjsState(undefined)).toBeNull();
    expect(deriveTaskDescriptionYjsState('')).toBeNull();
    expect(deriveTaskDescriptionYjsState('   ')).toBeNull();
  });

  it('derives yjs state from plain text', () => {
    const state = deriveTaskDescriptionYjsState(
      'Mobile plain text description'
    );

    expect(state).not.toBeNull();
    expect(Array.isArray(state)).toBe(true);
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('derives yjs state from TipTap JSON descriptions', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Task heading' }],
          },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Checked item' }],
                  },
                ],
              },
            ],
          },
        ],
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('falls back to plain text conversion for unsupported JSON nodes', () => {
    const state = deriveTaskDescriptionYjsState(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'unsupportedNodeType',
            content: [{ type: 'text', text: 'fallback text' }],
          },
        ],
      })
    );

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });

  it('handles full-featured web editor payloads', () => {
    const state = deriveTaskDescriptionYjsState(fullFeaturedDescription);

    expect(state).not.toBeNull();
    expect(state?.length ?? 0).toBeGreaterThan(0);
  });
});
