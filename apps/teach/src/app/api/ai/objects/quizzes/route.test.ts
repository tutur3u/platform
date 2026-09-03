import { describe, expect, it } from 'vitest';
import { contextObjectRequestSchema } from '../schemas';

describe('quiz object request', () => {
  it('accepts the current Teach quiz-generator payload', () => {
    expect(
      contextObjectRequestSchema.parse({
        context: 'Generate a photosynthesis quiz',
        wsId: 'workspace-1',
      })
    ).toEqual({
      context: 'Generate a photosynthesis quiz',
      wsId: 'workspace-1',
    });
  });
});
