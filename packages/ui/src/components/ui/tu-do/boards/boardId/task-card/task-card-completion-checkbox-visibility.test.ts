import { describe, expect, it } from 'vitest';
import { shouldRenderTaskCardCompletionCheckbox } from './task-card-completion-checkbox-visibility';

describe('shouldRenderTaskCardCompletionCheckbox', () => {
  it('renders the done checkbox in normal task mode', () => {
    expect(
      shouldRenderTaskCardCompletionCheckbox({
        isMultiSelectMode: false,
        taskListStatus: 'active',
      })
    ).toBe(true);
  });

  it('hides the done checkbox in multi-select mode', () => {
    expect(
      shouldRenderTaskCardCompletionCheckbox({
        isMultiSelectMode: true,
        taskListStatus: 'active',
      })
    ).toBe(false);
  });

  it('keeps document-list completion checkboxes hidden', () => {
    expect(
      shouldRenderTaskCardCompletionCheckbox({
        isMultiSelectMode: false,
        taskListStatus: 'documents',
      })
    ).toBe(false);
  });
});
