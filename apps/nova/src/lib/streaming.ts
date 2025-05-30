/**
 * Utility functions for handling streaming responses in Nova
 */

export interface ProgressUpdate {
  step: string;
  progress: number;
  message: string;
  data?: any;
}

export type ProgressHandler = (update: ProgressUpdate) => void;

/**
 * Parses streaming Server-Sent Events from a fetch response
 * @param response - The fetch response object
 * @param onProgress - Callback function to handle progress updates
 * @param onError - Optional callback function to handle errors
 */
export async function parseStreamingResponse(
  response: Response,
  onProgress: ProgressHandler,
  onError?: (error: Error) => void
): Promise<void> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const progressData: ProgressUpdate = JSON.parse(line.substring(6));
            onProgress(progressData);

            // Check for error state
            if (progressData.step === 'error') {
              const error = new Error(
                progressData.data?.error || progressData.message
              );
              if (onError) {
                onError(error);
              } else {
                throw error;
              }
            }
          } catch (parseError) {
            console.error('Error parsing progress data:', parseError);
            if (onError) {
              onError(
                parseError instanceof Error
                  ? parseError
                  : new Error('Parse error')
              );
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Makes a streaming request to the Nova prompt evaluation API
 * @param problemId - The problem ID
 * @param prompt - The prompt to evaluate
 * @param sessionId - Optional session ID
 * @param onProgress - Callback function to handle progress updates
 * @param onError - Optional callback function to handle errors
 */
export async function evaluatePromptStreaming(
  problemId: string,
  prompt: string,
  sessionId: string | undefined,
  onProgress: ProgressHandler,
  onError?: (error: Error) => void
): Promise<void> {
  const response = await fetch(`/api/v1/problems/${problemId}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      sessionId,
    }),
  });

  return parseStreamingResponse(response, onProgress, onError);
}

/**
 * Enhanced step configuration for UI display with better visual organization
 */
export const STEP_CONFIG: Record<
  string,
  {
    icon: string;
    label: string;
    color: string;
    description: string;
    category: 'setup' | 'validation' | 'ai-processing' | 'finalization';
    weight: number;
    order: number;
  }
> = {
  initialization: {
    icon: 'zap',
    label: 'Initializing',
    color: 'bg-dynamic-blue',
    description: 'Starting evaluation engine',
    category: 'setup',
    weight: 1,
    order: 1,
  },
  fetching_problem: {
    icon: 'database',
    label: 'Loading Problem',
    color: 'bg-dynamic-blue',
    description: 'Retrieving problem details',
    category: 'setup',
    weight: 1,
    order: 2,
  },
  checking_permissions: {
    icon: 'shield',
    label: 'Access Control',
    color: 'bg-dynamic-amber',
    description: 'Verifying permissions',
    category: 'validation',
    weight: 1,
    order: 3,
  },
  plagiarism_check: {
    icon: 'search',
    label: 'Originality Scan',
    color: 'bg-dynamic-amber',
    description: 'Analyzing originality',
    category: 'validation',
    weight: 2,
    order: 4,
  },
  fetching_test_data: {
    icon: 'database',
    label: 'Test Data',
    color: 'bg-dynamic-blue',
    description: 'Loading test cases',
    category: 'setup',
    weight: 1,
    order: 5,
  },
  creating_submission: {
    icon: 'plus',
    label: 'Creating Record',
    color: 'bg-dynamic-blue',
    description: 'Creating submission',
    category: 'setup',
    weight: 1,
    order: 6,
  },
  evaluating_criteria: {
    icon: 'brain',
    label: 'AI Analysis',
    color: 'bg-dynamic-purple',
    description: 'Evaluating criteria',
    category: 'ai-processing',
    weight: 3,
    order: 7,
  },
  criteria_ai_processing: {
    icon: 'brain',
    label: 'Deep Analysis',
    color: 'bg-dynamic-purple',
    description: 'AI processing criteria',
    category: 'ai-processing',
    weight: 3,
    order: 8,
  },
  criteria_streaming: {
    icon: 'sparkles',
    label: 'Live Results',
    color: 'bg-dynamic-purple',
    description: 'Streaming criteria results',
    category: 'ai-processing',
    weight: 2,
    order: 9,
  },
  criteria_completed: {
    icon: 'check-circle',
    label: 'Criteria Done',
    color: 'bg-dynamic-green',
    description: 'Criteria evaluation complete',
    category: 'ai-processing',
    weight: 1,
    order: 10,
  },
  criteria_skipped: {
    icon: 'skip-forward',
    label: 'Criteria Skipped',
    color: 'bg-foreground/40',
    description: 'No criteria available',
    category: 'ai-processing',
    weight: 0,
    order: 10,
  },
  evaluating_test_cases: {
    icon: 'flask',
    label: 'Test Execution',
    color: 'bg-dynamic-indigo',
    description: 'Running test cases',
    category: 'ai-processing',
    weight: 3,
    order: 11,
  },
  test_case_ai_processing: {
    icon: 'flask',
    label: 'Test Processing',
    color: 'bg-dynamic-indigo',
    description: 'AI generating outputs',
    category: 'ai-processing',
    weight: 3,
    order: 12,
  },
  test_case_streaming: {
    icon: 'trending',
    label: 'Live Testing',
    color: 'bg-dynamic-indigo',
    description: 'Streaming test results',
    category: 'ai-processing',
    weight: 2,
    order: 13,
  },
  test_case_completed: {
    icon: 'check-circle',
    label: 'Tests Done',
    color: 'bg-dynamic-green',
    description: 'Test cases complete',
    category: 'ai-processing',
    weight: 1,
    order: 14,
  },
  test_cases_skipped: {
    icon: 'skip-forward',
    label: 'Tests Skipped',
    color: 'bg-foreground/40',
    description: 'No test cases available',
    category: 'ai-processing',
    weight: 0,
    order: 14,
  },
  processing_test_results: {
    icon: 'cog',
    label: 'Processing Results',
    color: 'bg-dynamic-blue',
    description: 'Analyzing outputs',
    category: 'finalization',
    weight: 2,
    order: 15,
  },
  finalizing: {
    icon: 'save',
    label: 'Finalizing',
    color: 'bg-dynamic-blue',
    description: 'Saving results',
    category: 'finalization',
    weight: 1,
    order: 16,
  },
  completed: {
    icon: 'check-circle',
    label: 'Complete',
    color: 'bg-dynamic-green',
    description: 'Evaluation completed',
    category: 'finalization',
    weight: 1,
    order: 17,
  },
  error: {
    icon: 'alert-circle',
    label: 'Error',
    color: 'bg-dynamic-red',
    description: 'Error occurred',
    category: 'finalization',
    weight: 0,
    order: 18,
  },
};

/**
 * Category configuration for UI display
 */
export const CATEGORY_CONFIG = {
  setup: {
    label: 'Setup',
    icon: 'cog',
    color: 'dynamic-blue',
    description: 'Initializing evaluation environment',
  },
  validation: {
    label: 'Validation',
    icon: 'shield',
    color: 'dynamic-amber',
    description: 'Verifying submission requirements',
  },
  'ai-processing': {
    label: 'AI Processing',
    icon: 'brain',
    color: 'dynamic-purple',
    description: 'AI evaluation and analysis',
  },
  finalization: {
    label: 'Finalization',
    icon: 'check-circle',
    color: 'dynamic-green',
    description: 'Completing and saving results',
  },
} as const;

/**
 * Get active steps based on actual progress flow
 */
export function getActiveSteps(steps: ProgressUpdate[]) {
  // Only return steps that have actually been encountered
  const stepMap = new Map<string, ProgressUpdate>();

  // Use the latest version of each step (iterate in order, later ones overwrite)
  steps.forEach((step) => {
    stepMap.set(step.step, step);
  });

  // Convert back to array and sort by logical order
  return Array.from(stepMap.values()).sort((a, b) => {
    const orderA = STEP_CONFIG[a.step]?.order || 999;
    const orderB = STEP_CONFIG[b.step]?.order || 999;
    return orderA - orderB;
  });
}

/**
 * Get steps grouped by category with only active steps
 */
export function getStepsByCategory(steps: ProgressUpdate[]) {
  const activeSteps = getActiveSteps(steps);
  const categories = {
    setup: [] as ProgressUpdate[],
    validation: [] as ProgressUpdate[],
    'ai-processing': [] as ProgressUpdate[],
    finalization: [] as ProgressUpdate[],
  };

  activeSteps.forEach((step) => {
    const category = STEP_CONFIG[step.step]?.category || 'setup';
    categories[category].push(step);
  });

  return categories;
}

/**
 * Calculate overall progress with dynamic weighting based on active steps
 */
export function calculateOverallProgress(steps: ProgressUpdate[]): number {
  if (steps.length === 0) return 0;

  const activeSteps = getActiveSteps(steps);
  if (activeSteps.length === 0) return 0;

  // Calculate progress based on step weights
  let totalWeightedProgress = 0;
  let totalWeight = 0;

  activeSteps.forEach((step) => {
    const config = STEP_CONFIG[step.step];
    if (config) {
      const weight = config.weight;
      totalWeightedProgress += (step.progress / 100) * weight;
      totalWeight += weight;
    }
  });

  return totalWeight > 0 ? (totalWeightedProgress / totalWeight) * 100 : 0;
}

/**
 * Get category completion status
 */
export function getCategoryStatus(category: string, steps: ProgressUpdate[]) {
  const categorySteps =
    getStepsByCategory(steps)[
      category as keyof ReturnType<typeof getStepsByCategory>
    ];

  if (categorySteps.length === 0) {
    return {
      completed: 0,
      total: 0,
      progress: 0,
      isActive: false,
      isComplete: false,
    };
  }

  const completed = categorySteps.filter(
    (step) =>
      step.progress === 100 ||
      step.step.includes('completed') ||
      step.step === 'completed'
  ).length;

  const total = categorySteps.length;
  const progress =
    categorySteps.reduce((sum, step) => sum + step.progress, 0) / total;

  const isActive = categorySteps.some(
    (step) =>
      step.progress > 0 &&
      step.progress < 100 &&
      !step.step.includes('completed')
  );

  const isComplete = completed === total && total > 0;

  return { completed, total, progress, isActive, isComplete };
}

/**
 * Get the current active step with timing information
 */
export function getCurrentStepInfo(steps: ProgressUpdate[]) {
  const activeSteps = getActiveSteps(steps);
  const currentStep =
    activeSteps.find(
      (step) =>
        step.progress > 0 &&
        step.progress < 100 &&
        !step.step.includes('completed')
    ) || activeSteps[activeSteps.length - 1];

  return {
    currentStep,
    timestamp: new Date().toLocaleTimeString(),
  };
}

/**
 * Check if a step should be shown based on evaluation context
 */
export function shouldShowStep(
  stepName: string,
  evaluationContext?: any
): boolean {
  // Always show these core steps
  const alwaysShow = [
    'initialization',
    'fetching_problem',
    'checking_permissions',
    'creating_submission',
    'finalizing',
    'completed',
    'error',
  ];

  if (alwaysShow.includes(stepName)) {
    return true;
  }

  // Show steps based on context (this would be expanded based on actual evaluation flow)
  if (
    stepName.includes('criteria') &&
    evaluationContext?.hasCriteria !== false
  ) {
    return true;
  }

  if (stepName.includes('test') && evaluationContext?.hasTestCases !== false) {
    return true;
  }

  if (stepName === 'plagiarism_check') {
    return true; // Always perform plagiarism check
  }

  return false;
}
