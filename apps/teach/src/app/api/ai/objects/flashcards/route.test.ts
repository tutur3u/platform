import { describe, expect, it } from 'vitest';
import { contextObjectRequestSchema } from '../schemas';

describe('flashcard object request', () => {
  it('accepts the current Teach flashcard-generator payload', () => {
    expect(
      contextObjectRequestSchema.parse({
        context: 'Generate biology flashcards',
        wsId: 'workspace-1',
      })
    ).toEqual({
      context: 'Generate biology flashcards',
      wsId: 'workspace-1',
    });
  });
});
