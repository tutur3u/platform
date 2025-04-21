import { z } from 'zod';

// Challenges
export const createChallengeSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  duration: z.number().positive('Duration must be a positive number'),
  enabled: z.boolean(),
  whitelistedOnly: z.boolean(),
  maxAttempts: z.number().min(1, {
    message: 'Max attempts must be at least 1.',
  }),
  maxDailyAttempts: z.number().min(1, {
    message: 'Max daily attempts must be at least 1.',
  }),
  password: z.string().nullable().optional(),
  previewableAt: z.string().nullable(),
  openAt: z.string().nullable(),
  closeAt: z.string().nullable(),
});

// Criteria
export const createCriterionSchema = z.object({
  challengeId: z.string().min(1, 'Challenge ID is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
});

// Problems
export const createProblemSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  maxPromptLength: z
    .number()
    .positive('Max prompt length must be a positive number'),
  exampleInput: z.string().min(1, 'Example input is required'),
  exampleOutput: z.string().min(1, 'Example output is required'),
  challengeId: z.string().min(1, 'Challenge ID is required'),
});

// Sessions
export const createSessionSchema = z.object({
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().nullable(),
  status: z.string().min(1, 'Status is required'),
  challengeId: z.string().min(1, 'Challenge ID is required'),
});

// Submissions
export const createSubmissionSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  problemId: z.string().min(1, 'Problem ID is required'),
  sessionId: z.string().min(1, 'Session ID is required').nullable(),
});

// Testcases
export const createTestcaseSchema = z.object({
  problemId: z.string().min(1, 'Problem ID is required'),
  input: z.string().min(1, 'Input is required'),
  output: z.string().min(1, 'Output is required'),
  hidden: z.boolean(),
});
