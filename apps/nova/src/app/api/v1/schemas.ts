import { z } from 'zod';

// Challenges
export const createChallengeSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  duration: z.number().positive('Duration must be a positive number'),
  criteria: z.array(
    z.object({
      name: z
        .string()
        .min(2, { message: 'Name must be at least 2 characters.' }),
      description: z.string().min(10, {
        message: 'Description must be at least 10 characters.',
      }),
    })
  ),
  enabled: z.boolean(),
  maxAttempts: z.number().min(1, {
    message: 'Max attempts must be at least 1.',
  }),
  maxDailyAttempts: z.number().min(1, {
    message: 'Max daily attempts must be at least 1.',
  }),
  password: z.string().nullable(),
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
  totalScore: z.number().min(0, 'Total score must be non-negative'),
  challengeId: z.string().min(1, 'Challenge ID is required'),
});

// Submissions
export const createSubmissionSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  feedback: z.string().min(1, 'Feedback is required'),
  score: z.number().min(0, 'Score must be non-negative'),
  problemId: z.string().min(1, 'Problem ID is required'),
});

// Testcases
export const createTestcaseSchema = z.object({
  problemId: z.string().min(1, 'Problem ID is required'),
  input: z.string().min(1, 'Input is required'),
});
