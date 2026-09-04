import { describe, expect, it } from 'vitest';
import { mergeTaskCardLabelOptions } from './task-card-label-options';

const localLabel = {
  id: 'local-label',
  name: 'Personal',
  color: 'BLUE',
};

const sourceLabel = {
  id: 'source-label',
  name: 'Source workspace',
  color: 'RED',
};

describe('mergeTaskCardLabelOptions', () => {
  it('does not expose task-only labels outside the active workspace context', () => {
    expect(
      mergeTaskCardLabelOptions([localLabel], [sourceLabel], {
        includeTaskOnlyLabels: false,
      })
    ).toEqual([localLabel]);
  });

  it('can retain task-only labels when task and resource workspaces match', () => {
    expect(
      mergeTaskCardLabelOptions([localLabel], [sourceLabel], {
        includeTaskOnlyLabels: true,
      })
    ).toEqual([localLabel, sourceLabel]);
  });
});
