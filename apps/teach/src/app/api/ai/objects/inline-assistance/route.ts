import { buildAssistanceMessages } from '@tuturuuu/education-core/education/inline-assistant';
import {
  validateTeachCourse,
  validateTeachCourseModule,
} from '@tuturuuu/education-core/teach/api';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createTeachObjectGenerationHandler } from '../shared';

import { inlineAssistanceRequestSchema } from './schema';

export const POST = createTeachObjectGenerationHandler({
  requestSchema: inlineAssistanceRequestSchema,
  outputSchema: z.object({
    suggestions: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          from: z.number().int().nonnegative(),
          to: z.number().int().positive(),
          original: z.string().max(12_000),
          explanation: z.string().min(1).max(2000),
          replacement: z.string().max(4000).optional(),
        })
      )
      .max(20),
  }),
  buildPrompt: ({ text }) => text,
  buildMessages: (input) =>
    buildAssistanceMessages(input.text, {
      workspaceEnabled: true,
      teacherLevel: input.level,
      subject: input.subject,
      locale: input.locale,
    })!,
  validateInput: async (input, { db, wsId }) => {
    try {
      const course = await validateTeachCourse({
        db,
        wsId,
        courseId: input.courseId,
      });
      const module =
        course &&
        (await validateTeachCourseModule({
          db,
          courseId: input.courseId,
          moduleId: input.moduleId,
        }));
      return module
        ? null
        : NextResponse.json({ error: 'Document not found' }, { status: 404 });
    } catch {
      return NextResponse.json(
        { error: 'Unable to verify document access' },
        { status: 500 }
      );
    }
  },
  useMemory: false,
  redactErrors: true,
  abortOnDisconnect: true,
  requestByteLimit: 80_000,
  customIdPrefix: 'inline-assistance',
  source: 'inline_assistance',
  surface: 'module_content',
});
