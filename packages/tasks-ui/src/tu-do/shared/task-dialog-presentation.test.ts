import { cn } from '@tuturuuu/utils/format';
import { describe, expect, it } from 'vitest';
import {
  resolveTaskDialogOpeningPresentation,
  TASK_DIALOG_FOCUSED_CONTENT_CLASS_NAME,
} from './task-dialog-presentation';

describe('TASK_DIALOG_FOCUSED_CONTENT_CLASS_NAME', () => {
  it('overrides the shared dialog width with the large product-dialog size', () => {
    const resolvedClassName = cn(
      'w-full sm:max-w-lg',
      TASK_DIALOG_FOCUSED_CONTENT_CLASS_NAME
    );

    expect(resolvedClassName).toContain('sm:max-w-5xl');
    expect(resolvedClassName).not.toContain('sm:max-w-lg');
  });
});

describe('resolveTaskDialogOpeningPresentation', () => {
  it('opens existing document-list tasks fullscreen', () => {
    expect(
      resolveTaskDialogOpeningPresentation({
        defaultPresentation: 'compact',
        mode: 'edit',
        selectedListStatus: 'documents',
      })
    ).toBe('fullscreen');
  });

  it('keeps create mode compact even in document lists', () => {
    expect(
      resolveTaskDialogOpeningPresentation({
        defaultPresentation: 'fullscreen',
        mode: 'create',
        selectedListStatus: 'documents',
      })
    ).toBe('compact');
  });

  it('respects the user default for existing non-document tasks', () => {
    expect(
      resolveTaskDialogOpeningPresentation({
        defaultPresentation: 'compact',
        mode: 'edit',
        selectedListStatus: 'active',
      })
    ).toBe('compact');

    expect(
      resolveTaskDialogOpeningPresentation({
        defaultPresentation: 'focused',
        mode: 'edit',
        selectedListStatus: 'active',
      })
    ).toBe('focused');

    expect(
      resolveTaskDialogOpeningPresentation({
        defaultPresentation: 'fullscreen',
        mode: 'edit',
        selectedListStatus: 'not_started',
      })
    ).toBe('fullscreen');
  });

  it('uses the focused view when a saved preference is missing or invalid', () => {
    expect(
      resolveTaskDialogOpeningPresentation({
        defaultPresentation: undefined,
        mode: 'edit',
      })
    ).toBe('focused');
    expect(
      resolveTaskDialogOpeningPresentation({
        defaultPresentation: 'unknown',
        mode: 'edit',
      })
    ).toBe('focused');
  });

  it('keeps drafts fullscreen', () => {
    expect(
      resolveTaskDialogOpeningPresentation({
        defaultPresentation: 'compact',
        draftId: 'draft-1',
        mode: 'create',
        selectedListStatus: 'documents',
      })
    ).toBe('fullscreen');
  });
});
