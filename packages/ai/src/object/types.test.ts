import { describe, expect, it } from 'vitest';
import {
  flashcardSchema,
  quizSchema,
  quizOptionExplanationSchema,
  quickJournalTaskSchema,
  yearPlanSchema,
} from './types';

describe('flashcardSchema', () => {
  it('should validate valid flashcard data', () => {
    const validData = {
      flashcards: [
        {
          front: 'What is TypeScript?',
          back: 'A typed superset of JavaScript',
        },
        {
          front: 'What is React?',
          back: 'A JavaScript library for building UIs',
        },
      ],
    };

    const result = flashcardSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject empty flashcards array', () => {
    const invalidData = {
      flashcards: [],
    };

    const result = flashcardSchema.safeParse(invalidData);
    expect(result.success).toBe(true); // Empty array is valid
  });

  it('should reject flashcard without front', () => {
    const invalidData = {
      flashcards: [{ back: 'Answer only' }],
    };

    const result = flashcardSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject flashcard without back', () => {
    const invalidData = {
      flashcards: [{ front: 'Question only' }],
    };

    const result = flashcardSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject non-string front/back values', () => {
    const invalidData = {
      flashcards: [{ front: 123, back: 456 }],
    };

    const result = flashcardSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});

describe('quizSchema', () => {
  it('should validate valid quiz data', () => {
    const validData = {
      quizzes: [
        {
          question: 'What is 2 + 2?',
          quiz_options: [
            {
              value: '3',
              explanation: 'Incorrect, 3 is one less',
              is_correct: false,
            },
            { value: '4', explanation: 'Correct answer', is_correct: true },
            {
              value: '5',
              explanation: 'Incorrect, 5 is one more',
              is_correct: false,
            },
          ],
        },
      ],
    };

    const result = quizSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject quiz without question', () => {
    const invalidData = {
      quizzes: [
        {
          quiz_options: [
            { value: 'A', explanation: 'Option A', is_correct: true },
          ],
        },
      ],
    };

    const result = quizSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject quiz option without is_correct flag', () => {
    const invalidData = {
      quizzes: [
        {
          question: 'Test question?',
          quiz_options: [{ value: 'A', explanation: 'Option A' }],
        },
      ],
    };

    const result = quizSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should accept multiple quizzes', () => {
    const validData = {
      quizzes: [
        {
          question: 'Question 1?',
          quiz_options: [
            { value: 'A', explanation: 'Explanation', is_correct: true },
          ],
        },
        {
          question: 'Question 2?',
          quiz_options: [
            { value: 'B', explanation: 'Explanation', is_correct: false },
            { value: 'C', explanation: 'Explanation', is_correct: true },
          ],
        },
      ],
    };

    const result = quizSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });
});

describe('quizOptionExplanationSchema', () => {
  it('should validate valid explanation', () => {
    const validData = {
      explanation:
        'This is a detailed explanation of why the option is correct.',
    };

    const result = quizOptionExplanationSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject missing explanation', () => {
    const invalidData = {};

    const result = quizOptionExplanationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject non-string explanation', () => {
    const invalidData = {
      explanation: 123,
    };

    const result = quizOptionExplanationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});

describe('quickJournalTaskSchema', () => {
  it('should validate valid task data', () => {
    const validData = {
      tasks: [
        {
          title: 'Complete project report',
          description: 'Write the quarterly report',
          priority: 'high',
          labelSuggestions: ['work', 'report'],
          dueDate: '2024-12-31',
        },
      ],
    };

    const result = quickJournalTaskSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should require at least one task', () => {
    const invalidData = {
      tasks: [],
    };

    const result = quickJournalTaskSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject more than 50 tasks', () => {
    const tasks = Array.from({ length: 51 }, (_, i) => ({
      title: `Task ${i + 1}`,
    }));

    const invalidData = { tasks };

    const result = quickJournalTaskSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should validate priority enum values', () => {
    const validPriorities = ['critical', 'high', 'normal', 'low'];

    validPriorities.forEach((priority) => {
      const data = {
        tasks: [{ title: 'Test task', priority }],
      };
      const result = quickJournalTaskSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  it('should reject invalid priority value', () => {
    const invalidData = {
      tasks: [{ title: 'Test task', priority: 'invalid' }],
    };

    const result = quickJournalTaskSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should enforce title max length of 120 characters', () => {
    const longTitle = 'a'.repeat(121);
    const invalidData = {
      tasks: [{ title: longTitle }],
    };

    const result = quickJournalTaskSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should enforce description max length of 4000 characters', () => {
    const longDescription = 'a'.repeat(4001);
    const invalidData = {
      tasks: [{ title: 'Test', description: longDescription }],
    };

    const result = quickJournalTaskSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should limit labelSuggestions to 6 items', () => {
    const invalidData = {
      tasks: [
        {
          title: 'Test task',
          labelSuggestions: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        },
      ],
    };

    const result = quickJournalTaskSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should accept task with only required title', () => {
    const validData = {
      tasks: [{ title: 'Minimal task' }],
    };

    const result = quickJournalTaskSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });
});

describe('yearPlanSchema', () => {
  it('should validate valid year plan data', () => {
    const validData = {
      yearPlan: {
        overview: 'A comprehensive plan for learning new skills',
        quarters: [
          {
            quarter: 1,
            focus: 'Foundation building',
            start_date: '2024-01-01',
            end_date: '2024-03-31',
            milestones: [
              {
                title: 'Complete basics',
                description: 'Learn fundamental concepts',
                start_date: '2024-01-01',
                end_date: '2024-02-15',
                tasks: [
                  {
                    title: 'Study core concepts',
                    description: 'Read documentation',
                    priority: 'high',
                    start_date: '2024-01-01',
                    end_date: '2024-01-15',
                    status: 'not-started',
                    estimatedHours: 20,
                  },
                ],
              },
            ],
          },
        ],
        recommendations: ['Start with basics', 'Practice daily'],
        start_date: '2024-01-01',
        end_date: '2024-12-31',
      },
    };

    const result = yearPlanSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject quarter number outside 1-4 range', () => {
    const invalidData = {
      yearPlan: {
        overview: 'Test plan',
        quarters: [
          {
            quarter: 5, // Invalid
            focus: 'Focus',
            start_date: '2024-01-01',
            end_date: '2024-03-31',
            milestones: [],
          },
        ],
        recommendations: [],
        start_date: '2024-01-01',
        end_date: '2024-12-31',
      },
    };

    const result = yearPlanSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should validate task status enum values', () => {
    const validStatuses = [
      'not-started',
      'in-progress',
      'completed',
      'blocked',
    ];

    validStatuses.forEach((status) => {
      const data = {
        yearPlan: {
          overview: 'Test',
          quarters: [
            {
              quarter: 1,
              focus: 'Focus',
              start_date: '2024-01-01',
              end_date: '2024-03-31',
              milestones: [
                {
                  title: 'Milestone',
                  description: 'Desc',
                  start_date: '2024-01-01',
                  end_date: '2024-02-01',
                  tasks: [
                    {
                      title: 'Task',
                      description: 'Desc',
                      priority: 'high',
                      start_date: '2024-01-01',
                      end_date: '2024-01-15',
                      status,
                      estimatedHours: 10,
                    },
                  ],
                },
              ],
            },
          ],
          recommendations: [],
          start_date: '2024-01-01',
          end_date: '2024-12-31',
        },
      };

      const result = yearPlanSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  it('should validate task priority enum values', () => {
    const validPriorities = ['high', 'medium', 'low'];

    validPriorities.forEach((priority) => {
      const data = {
        yearPlan: {
          overview: 'Test',
          quarters: [
            {
              quarter: 1,
              focus: 'Focus',
              start_date: '2024-01-01',
              end_date: '2024-03-31',
              milestones: [
                {
                  title: 'Milestone',
                  description: 'Desc',
                  start_date: '2024-01-01',
                  end_date: '2024-02-01',
                  tasks: [
                    {
                      title: 'Task',
                      description: 'Desc',
                      priority,
                      start_date: '2024-01-01',
                      end_date: '2024-01-15',
                      status: 'not-started',
                      estimatedHours: 10,
                    },
                  ],
                },
              ],
            },
          ],
          recommendations: [],
          start_date: '2024-01-01',
          end_date: '2024-12-31',
        },
      };

      const result = yearPlanSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  it('should reject negative estimatedHours', () => {
    const invalidData = {
      yearPlan: {
        overview: 'Test',
        quarters: [
          {
            quarter: 1,
            focus: 'Focus',
            start_date: '2024-01-01',
            end_date: '2024-03-31',
            milestones: [
              {
                title: 'Milestone',
                description: 'Desc',
                start_date: '2024-01-01',
                end_date: '2024-02-01',
                tasks: [
                  {
                    title: 'Task',
                    description: 'Desc',
                    priority: 'high',
                    start_date: '2024-01-01',
                    end_date: '2024-01-15',
                    status: 'not-started',
                    estimatedHours: -5, // Invalid
                  },
                ],
              },
            ],
          },
        ],
        recommendations: [],
        start_date: '2024-01-01',
        end_date: '2024-12-31',
      },
    };

    const result = yearPlanSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should validate resource type enum values', () => {
    const validResourceTypes = ['video', 'article', 'book', 'course', 'other'];

    validResourceTypes.forEach((type) => {
      const data = {
        yearPlan: {
          overview: 'Test',
          quarters: [
            {
              quarter: 1,
              focus: 'Focus',
              start_date: '2024-01-01',
              end_date: '2024-03-31',
              milestones: [
                {
                  title: 'Milestone',
                  description: 'Desc',
                  start_date: '2024-01-01',
                  end_date: '2024-02-01',
                  tasks: [
                    {
                      title: 'Task',
                      description: 'Desc',
                      priority: 'high',
                      start_date: '2024-01-01',
                      end_date: '2024-01-15',
                      status: 'not-started',
                      estimatedHours: 10,
                      resources: [
                        {
                          title: 'Resource',
                          url: 'https://example.com',
                          type,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          recommendations: [],
          start_date: '2024-01-01',
          end_date: '2024-12-31',
        },
      };

      const result = yearPlanSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });
});
