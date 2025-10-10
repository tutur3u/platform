import { z } from 'zod';

// For deeply nested translation objects, we use a simpler approach
// The AI SDK works best with concrete schemas rather than fully recursive ones
export const translationSchema = z.object({
  translations: z
    .any()
    .describe(
      'Complete Vietnamese translation object maintaining the exact structure of the English JSON'
    ),
});

export type TranslationResponse = z.infer<typeof translationSchema>;
