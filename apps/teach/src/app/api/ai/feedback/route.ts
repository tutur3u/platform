import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const RequestBodySchema = z.object({
  question: z.string(),
  type: z.string(),
  quizOptions: z.array(z.any()).optional(),
  correctAnswer: z.any().nullable().optional(),
  studentAnswer: z.any().nullable().optional(),
  isCorrect: z.boolean().nullable().optional(),
});

const FeedbackResultSchema = z.object({
  feedback: z.string(),
});

export const POST = withSessionAuth(
  async (request, context) => {
    try {
      if (!context.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      let rawBody: unknown;
      try {
        rawBody = await request.json();
      } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
      }

      const parsedBody = RequestBodySchema.safeParse(rawBody);
      if (!parsedBody.success) {
        return NextResponse.json(
          { error: 'Invalid request body', errors: parsedBody.error.issues },
          { status: 400 }
        );
      }

      const { question, type, quizOptions, correctAnswer, studentAnswer, isCorrect } = parsedBody.data;

      const prompt = `
You are an expert AI teaching assistant. Your task is to evaluate and explain a student's answer to a quiz question to help them learn.

Question details:
- Question: ${question}
- Question Type: ${type}
- Quiz Options (if multiple choice): ${JSON.stringify(quizOptions ?? [])}
- Correct Answer Reference: ${JSON.stringify(correctAnswer ?? '')}

Student Submission details:
- Student's Answer: ${JSON.stringify(studentAnswer ?? '')}
- System Auto-grade Result: ${isCorrect === true ? 'Correct' : isCorrect === false ? 'Incorrect' : 'Pending review'}

Instructions:
Provide a concise, constructive, and friendly explanation (2-3 sentences max) in the language of the question (Vietnamese if the question is in Vietnamese, English otherwise) explaining why the student's answer is correct or incorrect, or helping them understand the correct concept.
`;

      const { object } = await generateObject({
        model: google('gemini-2.5-flash'),
        schema: FeedbackResultSchema,
        prompt,
      });

      return NextResponse.json(object);
    } catch (error) {
      console.error('Failed to generate AI feedback:', error);
      return NextResponse.json(
        { error: 'Internal Server Error', message: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: { targetApp: 'teach' } }
);
