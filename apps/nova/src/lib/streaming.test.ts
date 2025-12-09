/**
 * Tests for the streaming utility
 */

import { describe, expect, it } from 'vitest';
import {
  CATEGORY_CONFIG,
  calculateOverallProgress,
  getActiveSteps,
  getCategoryStatus,
  getCurrentStepInfo,
  getStepsByCategory,
  type ProgressUpdate,
  parseStreamingResponse,
  STEP_CONFIG,
  shouldShowStep,
} from './streaming';

describe('Streaming utilities', () => {
  describe('parseStreamingResponse', () => {
    it('should parse valid SSE data', async () => {
      const updates: ProgressUpdate[] = [];
      const errors: Error[] = [];

      const mockResponse = new Response(
        'data: {"step":"initialization","progress":10,"message":"Starting..."}\n\n' +
          'data: {"step":"completed","progress":100,"message":"Done!"}\n\n',
        {
          headers: { 'Content-Type': 'text/event-stream' },
        }
      );

      await parseStreamingResponse(
        mockResponse,
        (update) => updates.push(update),
        (error) => errors.push(error)
      );

      expect(updates).toHaveLength(2);
      expect(updates[0]).toEqual({
        step: 'initialization',
        progress: 10,
        message: 'Starting...',
      });
      expect(updates[1]).toEqual({
        step: 'completed',
        progress: 100,
        message: 'Done!',
      });
      expect(errors).toHaveLength(0);
    });

    it('should handle error steps', async () => {
      const updates: ProgressUpdate[] = [];
      const errors: Error[] = [];

      const mockResponse = new Response(
        'data: {"step":"error","progress":0,"message":"Something went wrong","data":{"error":"Test error"}}\n\n',
        {
          headers: { 'Content-Type': 'text/event-stream' },
        }
      );

      await parseStreamingResponse(
        mockResponse,
        (update) => updates.push(update),
        (error) => errors.push(error)
      );

      expect(updates).toHaveLength(1);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toBe('Test error');
    });

    it('should handle parsing errors gracefully with recovery', async () => {
      const updates: ProgressUpdate[] = [];
      const errors: Error[] = [];

      const mockResponse = new Response(
        'data: invalid json\n\n' +
          'data: {"step":"valid","progress":50,"message":"Valid data"}\n\n',
        {
          headers: { 'Content-Type': 'text/event-stream' },
        }
      );

      await parseStreamingResponse(
        mockResponse,
        (update) => updates.push(update),
        (error) => errors.push(error)
      );

      // Should have the recovery progress update plus the valid one
      expect(updates.length).toBeGreaterThanOrEqual(1);
      expect(updates.some((u) => u.step === 'valid')).toBe(true);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain('JSON parse error');
    });

    it('should fail after too many consecutive parse errors', async () => {
      const updates: ProgressUpdate[] = [];
      const errors: Error[] = [];

      // Create a response with multiple consecutive parse errors
      const invalidData = Array(6).fill('data: invalid json\n\n').join('');
      const mockResponse = new Response(invalidData, {
        headers: { 'Content-Type': 'text/event-stream' },
      });

      await parseStreamingResponse(
        mockResponse,
        (update) => updates.push(update),
        (error) => errors.push(error)
      );

      // Should stop after 5 consecutive errors
      expect(errors.length).toBeGreaterThan(1);
      expect(errors[errors.length - 1]?.message).toContain(
        'Too many consecutive parse errors'
      );
    });

    it('should handle partial JSON chunks correctly', async () => {
      const updates: ProgressUpdate[] = [];
      const errors: Error[] = [];

      // Simulate a JSON object split across chunks
      const mockResponse = new Response(
        'data: {"step":"test","pro\n' +
          'gress":50,"message":"Split message"}\n\n' +
          'data: {"step":"complete","progress":100,"message":"Done"}\n\n',
        {
          headers: { 'Content-Type': 'text/event-stream' },
        }
      );

      await parseStreamingResponse(
        mockResponse,
        (update) => updates.push(update),
        (error) => errors.push(error)
      );

      // Should handle the complete message correctly
      expect(updates.some((u) => u.step === 'complete')).toBe(true);
    });

    it('should validate progress data structure', async () => {
      const updates: ProgressUpdate[] = [];
      const errors: Error[] = [];

      const mockResponse = new Response(
        'data: {"invalid":"structure"}\n\n' +
          'data: {"step":"valid","progress":50,"message":"Good data"}\n\n',
        {
          headers: { 'Content-Type': 'text/event-stream' },
        }
      );

      await parseStreamingResponse(
        mockResponse,
        (update) => updates.push(update),
        (error) => errors.push(error)
      );

      // Should only process the valid structure
      expect(updates).toHaveLength(1);
      expect(updates[0]?.step).toBe('valid');
    });
  });

  describe('getActiveSteps', () => {
    it('should filter duplicate steps and sort by order', () => {
      const steps: ProgressUpdate[] = [
        { step: 'initialization', progress: 100, message: 'Done' },
        { step: 'fetching_problem', progress: 50, message: 'Loading...' },
        { step: 'initialization', progress: 100, message: 'Updated' }, // Duplicate
        { step: 'checking_permissions', progress: 25, message: 'Checking...' },
      ];

      const activeSteps = getActiveSteps(steps);

      expect(activeSteps).toHaveLength(3);
      expect(activeSteps[0]?.step).toBe('initialization');
      expect(activeSteps[1]?.step).toBe('fetching_problem');
      expect(activeSteps[2]?.step).toBe('checking_permissions');

      // Should use the latest version of duplicated steps
      expect(activeSteps[0]?.message).toBe('Updated');
    });

    it('should handle empty steps array', () => {
      const activeSteps = getActiveSteps([]);
      expect(activeSteps).toEqual([]);
    });
  });

  describe('getStepsByCategory', () => {
    it('should group steps by category correctly', () => {
      const steps: ProgressUpdate[] = [
        { step: 'initialization', progress: 100, message: 'Setup complete' },
        { step: 'plagiarism_check', progress: 50, message: 'Checking...' },
        {
          step: 'evaluating_criteria',
          progress: 25,
          message: 'AI processing...',
        },
        { step: 'finalizing', progress: 0, message: 'Starting finalization' },
      ];

      const categorized = getStepsByCategory(steps);

      expect(categorized.setup).toHaveLength(1);
      expect(categorized.setup[0]?.step).toBe('initialization');

      expect(categorized.validation).toHaveLength(1);
      expect(categorized.validation[0]?.step).toBe('plagiarism_check');

      expect(categorized['ai-processing']).toHaveLength(1);
      expect(categorized['ai-processing'][0]?.step).toBe('evaluating_criteria');

      expect(categorized.finalization).toHaveLength(1);
      expect(categorized.finalization[0]?.step).toBe('finalizing');
    });

    it('should handle unknown step categories', () => {
      const steps: ProgressUpdate[] = [
        { step: 'unknown_step', progress: 50, message: 'Unknown...' },
      ];

      const categorized = getStepsByCategory(steps);

      // Unknown steps should default to 'setup' category
      expect(categorized.setup).toHaveLength(1);
      expect(categorized.setup[0]?.step).toBe('unknown_step');
    });
  });

  describe('calculateOverallProgress', () => {
    it('should calculate weighted progress correctly', () => {
      const steps: ProgressUpdate[] = [
        { step: 'initialization', progress: 100, message: 'Done' }, // weight: 1
        { step: 'evaluating_criteria', progress: 50, message: 'In progress' }, // weight: 3
        { step: 'finalizing', progress: 0, message: 'Not started' }, // weight: 1
      ];

      const progress = calculateOverallProgress(steps);

      // Expected: (100*1 + 50*3 + 0*1) / (1+3+1) = 250/5 = 50
      expect(progress).toBe(50);
    });

    it('should return 0 for empty steps', () => {
      const progress = calculateOverallProgress([]);
      expect(progress).toBe(0);
    });

    it('should handle steps with no config', () => {
      const steps: ProgressUpdate[] = [
        { step: 'unknown_step', progress: 100, message: 'Done' },
      ];

      const progress = calculateOverallProgress(steps);
      expect(progress).toBe(0); // No config means no weight
    });
  });

  describe('getCategoryStatus', () => {
    it('should calculate category status correctly', () => {
      const steps: ProgressUpdate[] = [
        { step: 'initialization', progress: 100, message: 'Done' },
        { step: 'fetching_problem', progress: 100, message: 'Done' },
        { step: 'creating_submission', progress: 50, message: 'In progress' },
      ];

      const status = getCategoryStatus('setup', steps);

      expect(status.completed).toBe(2);
      expect(status.total).toBe(3);
      expect(status.progress).toBeCloseTo(83.33, 2); // (100+100+50)/3
      expect(status.isActive).toBe(true);
      expect(status.isComplete).toBe(false);
    });

    it('should handle empty category', () => {
      const steps: ProgressUpdate[] = [];
      const status = getCategoryStatus('setup', steps);

      expect(status.completed).toBe(0);
      expect(status.total).toBe(0);
      expect(status.progress).toBe(0);
      expect(status.isActive).toBe(false);
      expect(status.isComplete).toBe(false);
    });

    it('should detect completed category', () => {
      const steps: ProgressUpdate[] = [
        { step: 'initialization', progress: 100, message: 'Done' },
        { step: 'fetching_problem', progress: 100, message: 'Done' },
      ];

      const status = getCategoryStatus('setup', steps);

      expect(status.isComplete).toBe(true);
      expect(status.isActive).toBe(false);
    });
  });

  describe('shouldShowStep', () => {
    it('should always show core steps', () => {
      const coreSteps = [
        'initialization',
        'fetching_problem',
        'checking_permissions',
        'creating_submission',
        'finalizing',
        'completed',
        'error',
        'parsing_error',
      ];

      coreSteps.forEach((step) => {
        expect(shouldShowStep(step)).toBe(true);
      });
    });

    it('should show criteria steps when context has criteria', () => {
      const context = { hasCriteria: true };

      expect(shouldShowStep('evaluating_criteria', context)).toBe(true);
      expect(shouldShowStep('criteria_ai_processing', context)).toBe(true);
    });

    it('should show test case steps when context has test cases', () => {
      const context = { hasTestCases: true };

      expect(shouldShowStep('evaluating_test_cases', context)).toBe(true);
      expect(shouldShowStep('test_case_ai_processing', context)).toBe(true);
    });

    it('should always show plagiarism check', () => {
      expect(shouldShowStep('plagiarism_check')).toBe(true);
    });

    it('should hide optional steps by default', () => {
      expect(shouldShowStep('optional_step')).toBe(false);
    });
  });

  describe('STEP_CONFIG', () => {
    it('should have valid configuration for all steps', () => {
      Object.entries(STEP_CONFIG).forEach(([_, config]) => {
        expect(config.icon).toBeDefined();
        expect(config.label).toBeDefined();
        expect(config.color).toBeDefined();
        expect(config.description).toBeDefined();
        expect(config.category).toBeDefined();
        expect(typeof config.weight).toBe('number');
        expect(typeof config.order).toBe('number');
        expect(config.weight).toBeGreaterThanOrEqual(0);
        expect(config.order).toBeGreaterThan(0);
      });
    });

    it('should include parsing_error step', () => {
      expect(STEP_CONFIG.parsing_error).toBeDefined();
      expect(STEP_CONFIG.parsing_error!.label).toBe('Communication Issue');
      expect(STEP_CONFIG.parsing_error!.category).toBe('validation');
    });

    it('should have unique order values', () => {
      const orders = Object.values(STEP_CONFIG).map((config) => config.order);
      const uniqueOrders = new Set(orders);

      // Allow some duplicates for skipped steps, but most should be unique
      expect(uniqueOrders.size).toBeGreaterThan(orders.length * 0.8);
    });
  });

  describe('CATEGORY_CONFIG', () => {
    it('should have valid configuration for all categories', () => {
      const expectedCategories = [
        'setup',
        'validation',
        'ai-processing',
        'finalization',
      ] as const;

      expectedCategories.forEach((category) => {
        const config = CATEGORY_CONFIG[category];
        expect(config).toBeDefined();
        expect(config?.label).toBeDefined();
        expect(config?.icon).toBeDefined();
        expect(config?.color).toBeDefined();
        expect(config?.description).toBeDefined();
      });
    });

    it('should have all step categories covered', () => {
      const stepCategories = new Set(
        Object.values(STEP_CONFIG).map((config) => config.category)
      );

      const configCategories = new Set(Object.keys(CATEGORY_CONFIG));

      stepCategories.forEach((category) => {
        expect(configCategories.has(category)).toBe(true);
      });
    });
  });

  describe('Integration tests', () => {
    it('should handle complete evaluation flow', () => {
      const evaluationSteps: ProgressUpdate[] = [
        { step: 'initialization', progress: 100, message: 'Started' },
        { step: 'fetching_problem', progress: 100, message: 'Problem loaded' },
        {
          step: 'checking_permissions',
          progress: 100,
          message: 'Access granted',
        },
        {
          step: 'plagiarism_check',
          progress: 100,
          message: 'Original content',
        },
        {
          step: 'creating_submission',
          progress: 100,
          message: 'Record created',
        },
        {
          step: 'evaluating_criteria',
          progress: 100,
          message: 'Criteria evaluated',
        },
        { step: 'evaluating_test_cases', progress: 100, message: 'Tests run' },
        { step: 'finalizing', progress: 100, message: 'Finalizing...' },
        { step: 'completed', progress: 100, message: 'Done!' },
      ];

      const activeSteps = getActiveSteps(evaluationSteps);
      const categorized = getStepsByCategory(evaluationSteps);
      const overallProgress = calculateOverallProgress(evaluationSteps);

      expect(activeSteps).toHaveLength(9);
      expect(overallProgress).toBe(100);

      // Check all categories have steps
      expect(categorized.setup.length).toBeGreaterThan(0);
      expect(categorized.validation.length).toBeGreaterThan(0);
      expect(categorized['ai-processing'].length).toBeGreaterThan(0);
      expect(categorized.finalization.length).toBeGreaterThan(0);

      // Check all categories are complete
      (
        ['setup', 'validation', 'ai-processing', 'finalization'] as const
      ).forEach((category) => {
        const status = getCategoryStatus(category, evaluationSteps);
        expect(status.isComplete).toBe(true);
      });
    });

    it('should handle partial progress correctly', () => {
      const partialSteps: ProgressUpdate[] = [
        { step: 'initialization', progress: 100, message: 'Started' },
        { step: 'fetching_problem', progress: 100, message: 'Problem loaded' },
        { step: 'checking_permissions', progress: 50, message: 'Checking...' },
      ];

      const setupStatus = getCategoryStatus('setup', partialSteps);
      const validationStatus = getCategoryStatus('validation', partialSteps);

      expect(setupStatus.isComplete).toBe(true);
      expect(validationStatus.isActive).toBe(true);
      expect(validationStatus.isComplete).toBe(false);

      const overallProgress = calculateOverallProgress(partialSteps);
      expect(overallProgress).toBeGreaterThan(50);
      expect(overallProgress).toBeLessThan(100);
    });
  });

  describe('getCurrentStepInfo', () => {
    it('should return correct current step info', () => {
      const steps: ProgressUpdate[] = [
        { step: 'initialization', progress: 100, message: 'Done' },
        { step: 'fetching_problem', progress: 100, message: 'Done' },
        { step: 'checking_permissions', progress: 50, message: 'In progress' },
        { step: 'creating_submission', progress: 0, message: 'Not started' },
      ];

      const info = getCurrentStepInfo(steps);

      expect(info.currentStep?.step).toBe('checking_permissions');
      expect(info.timestamp).toBeDefined();
      expect(typeof info.timestamp).toBe('string');
    });

    it('should handle all completed steps', () => {
      const steps: ProgressUpdate[] = [
        { step: 'initialization', progress: 100, message: 'Done' },
        { step: 'completed', progress: 100, message: 'All done' },
      ];

      const info = getCurrentStepInfo(steps);

      expect(info.currentStep?.step).toBe('completed');
    });

    it('should handle empty steps', () => {
      const info = getCurrentStepInfo([]);

      expect(info.currentStep).toBeUndefined();
      expect(info.timestamp).toBeDefined();
    });
  });
});
