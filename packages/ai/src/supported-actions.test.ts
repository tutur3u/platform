import { describe, expect, it } from 'vitest';
import { supportedActions } from './supported-actions.js';

describe('supportedActions', () => {
  it('should be a readonly array', () => {
    expect(Array.isArray(supportedActions)).toBe(true);
  });

  it('should contain "new" action', () => {
    expect(supportedActions).toContain('new');
  });

  it('should contain "summary" action', () => {
    expect(supportedActions).toContain('summary');
  });

  it('should have exactly 2 supported actions', () => {
    expect(supportedActions).toHaveLength(2);
  });

  it('should have all unique values', () => {
    const uniqueActions = new Set(supportedActions);
    expect(uniqueActions.size).toBe(supportedActions.length);
  });

  it('should only contain string values', () => {
    supportedActions.forEach((action) => {
      expect(typeof action).toBe('string');
    });
  });
});
