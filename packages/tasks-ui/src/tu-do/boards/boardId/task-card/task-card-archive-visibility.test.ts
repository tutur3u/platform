import { describe, expect, it } from 'vitest';
import { shouldRenderTaskCardQuickArchive } from './task-card-archive-visibility';

describe('shouldRenderTaskCardQuickArchive', () => {
  it('shows quick archive for document lists when a closed list exists', () => {
    expect(
      shouldRenderTaskCardQuickArchive({
        hasTargetClosedList: true,
        isOverlay: false,
        taskListStatus: 'documents',
      })
    ).toBe(true);
  });

  it('keeps quick archive hidden for document lists without a closed list', () => {
    expect(
      shouldRenderTaskCardQuickArchive({
        hasTargetClosedList: false,
        isOverlay: false,
        taskListStatus: 'documents',
      })
    ).toBe(false);
  });

  it('keeps non-done workflow lists unchanged', () => {
    expect(
      shouldRenderTaskCardQuickArchive({
        hasTargetClosedList: true,
        isOverlay: false,
        taskListStatus: 'active',
      })
    ).toBe(false);
  });

  it('hides quick archive while rendering a drag overlay', () => {
    expect(
      shouldRenderTaskCardQuickArchive({
        hasTargetClosedList: true,
        isOverlay: true,
        taskListStatus: 'documents',
      })
    ).toBe(false);
  });
});
