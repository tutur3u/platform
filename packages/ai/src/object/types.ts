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

export const architectureSchema = z.object({
  buildingAnalysis: z.object({
    regulationSummary: z
      .string()
      .describe(
        'Summary of all relevant building regulations and codes for the specified location'
      ),
    permitRequirements: z
      .array(
        z.object({
          name: z.string().describe('Name of the permit or approval required'),
          description: z
            .string()
            .describe('Description of the permit requirements'),
          timeline: z
            .string()
            .describe('Estimated timeline to obtain this permit'),
          estimatedCost: z
            .string()
            .describe('Estimated cost to obtain this permit'),
          requiredDocuments: z
            .array(z.string())
            .describe('List of documents required for this permit'),
        })
      )
      .describe(
        'List of permits and approvals required for the building project'
      ),
    timeline: z
      .array(
        z.object({
          phase: z.string().describe('Name of the construction phase'),
          description: z
            .string()
            .describe('Description of activities during this phase'),
          startDate: z
            .string()
            .describe('Estimated start date (relative to project kickoff)'),
          duration: z.string().describe('Estimated duration of this phase'),
          dependencies: z
            .array(z.string())
            .optional()
            .describe(
              'Phases that must be completed before this one can start'
            ),
          keyMilestones: z
            .array(
              z.object({
                name: z.string().describe('Name of the milestone'),
                description: z
                  .string()
                  .describe('Description of the milestone'),
                estimatedDate: z
                  .string()
                  .describe('Estimated date to reach this milestone'),
              })
            )
            .describe('Key milestones within this phase'),
        })
      )
      .describe('Timeline of construction phases'),
    costEstimation: z
      .object({
        totalEstimate: z
          .string()
          .describe('Total estimated cost range for the entire project'),
        breakdown: z
          .array(
            z.object({
              category: z
                .string()
                .describe(
                  'Cost category (e.g., "Land acquisition", "Design", "Construction", "Permits")'
                ),
              estimate: z
                .string()
                .describe('Estimated cost range for this category'),
              notes: z
                .string()
                .describe(
                  'Any relevant notes or factors affecting this estimate'
                ),
            })
          )
          .describe('Breakdown of costs by category'),
        costFactors: z
          .array(z.string())
          .describe('Key factors affecting cost estimates'),
      })
      .describe('Cost estimation for the project'),
    environmentalConsiderations: z
      .array(
        z.object({
          aspect: z.string().describe('Environmental aspect to consider'),
          description: z
            .string()
            .describe('Description of this environmental consideration'),
          regulatoryRequirements: z
            .string()
            .describe('Regulatory requirements related to this aspect'),
          recommendedActions: z
            .array(z.string())
            .describe('Recommended actions to address this aspect'),
        })
      )
      .describe('Environmental considerations for the project'),
    recommendations: z
      .array(z.string())
      .describe('General recommendations for the project'),
    riskAssessment: z
      .array(
        z.object({
          risk: z.string().describe('Potential risk to the project'),
          impact: z
            .enum(['low', 'medium', 'high'])
            .describe('Potential impact of this risk'),
          likelihood: z
            .enum(['low', 'medium', 'high'])
            .describe('Likelihood of this risk occurring'),
          mitigationStrategies: z
            .array(z.string())
            .describe('Strategies to mitigate this risk'),
        })
      )
      .describe('Assessment of potential risks to the project'),
  }),
});
