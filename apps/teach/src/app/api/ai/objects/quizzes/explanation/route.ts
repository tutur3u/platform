import { quizOptionExplanationSchema } from '@tuturuuu/ai/object/types';
import { quizExplanationRequestSchema } from '../../schemas';
import { createTeachObjectGenerationHandler } from '../../shared';

export const POST = createTeachObjectGenerationHandler({
  buildPrompt: ({ option, question }) =>
    `Generate an explanation with the following context: \n\n"""Question: ${question}""" \n\n"""Option: ${option.value}"""\n\nIs this option correct? ${option.is_correct ? 'Yes' : 'No'}\n\nNOTE: Provide it in the same language as the question and option, be concise and clear.`,
  customIdPrefix: 'quiz-explanation',
  outputSchema: quizOptionExplanationSchema,
  requestSchema: quizExplanationRequestSchema,
  source: 'quiz_explanation',
  surface: 'quiz_explanation',
});
