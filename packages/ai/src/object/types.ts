import { z } from 'zod';

export const flashcardSchema = z.object({
  flashcards: z.array(
    z.object({
      front: z.string().describe('Question. Do not use emojis or links.'),
      back: z.string().describe('Answer. Do not use emojis or links.'),
    })
  ),
});

export const quizSchema = z.object({
  quizzes: z.array(
    z.object({
      question: z.string().describe('Question. Do not use emojis or links.'),
      quiz_options: z.array(
        z.object({
          value: z.string().describe('Option. Do not use emojis or links.'),
          explanation: z
            .string()
            .describe(
              'Explain why this option is correct or incorrect, if it is incorrect, explain possible misconceptions and what made the option wrong with respect to the question, if it is correct, explain why it is correct. Be as detailed as possible.'
            ),
          is_correct: z.boolean().describe('This option is a correct answer.'),
        })
      ),
    })
  ),
});

export const quizOptionExplanationSchema = z.object({
  explanation: z
    .string()
    .describe(
      'Explain why this option is correct or incorrect, if it is incorrect, explain possible misconceptions and what made the option wrong with respect to the question, if it is correct, explain why it is correct. Be as detailed as possible.'
    ),
});

const resourceSchema = z.object({
  title: z.string().describe('Title of the resource'),
  url: z.string().describe('URL or link to the resource'),
  type: z
    .enum(['video', 'article', 'book', 'course', 'other'])
    .describe('Type of resource'),
});

const taskSchema = z.object({
  title: z.string().describe('Title of the task'),
  description: z
    .string()
    .describe('Detailed description of what needs to be done'),
  priority: z
    .enum(['high', 'medium', 'low'])
    .describe('Priority level of the task'),
  start_date: z.string().describe('Start date of the task (ISO date string)'),
  end_date: z.string().describe('End date of the task (ISO date string)'),
  status: z
    .enum(['not-started', 'in-progress', 'completed', 'blocked'])
    .describe('Current status of the task'),
  estimatedHours: z
    .number()
    .min(0)
    .describe('Estimated hours to complete the task'),
  // dependencies: z
  //   .array(z.string())
  //   .optional()
  //   .describe('List of dependencies for this task'),
  resources: z
    .array(resourceSchema)
    .optional()
    .describe('Learning resources for this task'),
});

const milestoneSchema = z.object({
  title: z.string().describe('Title of the milestone'),
  description: z
    .string()
    .describe('Detailed description of what needs to be achieved'),
  start_date: z
    .string()
    .describe('Start date of the milestone (ISO date string)'),
  end_date: z.string().describe('End date of the milestone (ISO date string)'),
  tasks: z.array(taskSchema).describe('List of tasks for this milestone'),
  // progress: z
  //   .number()
  //   .min(0)
  //   .max(100)
  //   .describe('Progress percentage of the milestone'),
  // objectives: z
  //   .array(z.string())
  //   .describe('Learning objectives for this milestone'),
  // keyOutcomes: z
  //   .array(z.string())
  //   .describe('Key outcomes expected from this milestone'),
});

const quarterSchema = z.object({
  quarter: z.number().min(1).max(4).describe('Quarter number (1-4)'),
  focus: z.string().describe('Main focus and objectives for this quarter'),
  milestones: z
    .array(milestoneSchema)
    .describe('List of milestones for this quarter'),
  start_date: z
    .string()
    .describe('Start date of the quarter (ISO date string)'),
  end_date: z.string().describe('End date of the quarter (ISO date string)'),
  // learningObjectives: z
  //   .array(z.string())
  //   .describe('Learning objectives for this quarter'),
  // expectedOutcomes: z
  //   .array(z.string())
  //   .describe('Expected outcomes for this quarter'),
  // progress: z
  //   .number()
  //   .min(0)
  //   .max(100)
  //   .optional()
  //   .describe('Progress percentage of the quarter'),
});

export const yearPlanSchema = z.object({
  yearPlan: z.object({
    overview: z
      .string()
      .describe(
        'A high-level overview of the year plan and how the goals will be achieved'
      ),
    quarters: z
      .array(quarterSchema)
      .describe('List of quarters in the year plan'),
    recommendations: z
      .array(z.string())
      .describe('Additional recommendations, tips, or considerations'),
    start_date: z
      .string()
      .describe('Start date of the year plan (ISO date string)'),
    end_date: z
      .string()
      .describe('End date of the year plan (ISO date string)'),
    // metadata: metadataSchema.describe('Additional metadata about the plan'),
    // progress: progressSchema.describe('Overall progress tracking'),
  }),
});
