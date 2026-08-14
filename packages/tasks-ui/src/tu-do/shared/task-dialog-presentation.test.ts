import { cn } from '@tuturuuu/utils/format';
import { describe, expect, it } from 'vitest';
import {
  resolveTaskDialogOpeningPresentation,
  TASK_DIALOG_CONTENT_COLUMN_CLASS_NAME,
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

  // Regression: the focused dialog is a fixed-height `display: grid` box with
  // `overflow-hidden`, so its content column must be allowed to shrink below its
  // content. Without `min-h-0` the grid row grew to the full description height
  // and the dialog clipped it — the task dialog could not be scrolled at all.
  it('keeps the fixed height and clipping the content column depends on', () => {
    expect(TASK_DIALOG_FOCUSED_CONTENT_CLASS_NAME).toContain(
      'h-[min(92dvh,60rem)]'
    );
    expect(TASK_DIALOG_FOCUSED_CONTENT_CLASS_NAME).toContain('overflow-hidden');
  });
});

describe('TASK_DIALOG_CONTENT_COLUMN_CLASS_NAME', () => {
  it('can shrink below its content so the inner scroll area is bounded', () => {
    expect(TASK_DIALOG_CONTENT_COLUMN_CLASS_NAME).toContain('min-h-0');
    expect(TASK_DIALOG_CONTENT_COLUMN_CLASS_NAME).toContain('flex-1');
    expect(TASK_DIALOG_CONTENT_COLUMN_CLASS_NAME).toContain('flex-col');
  });
});

describe('resolveTaskDialogOpeningPresentation', () => {
  const preferences = {
    taskCreate: 'compact',
    taskEdit: 'focused',
    documentCreate: 'focused',
    documentEdit: 'fullscreen',
  } as const;

  it('uses the configured document editing presentation', () => {
    expect(
      resolveTaskDialogOpeningPresentation({
        preferences,
        mode: 'edit',
        selectedListStatus: 'documents',
      })
    ).toBe('fullscreen');
  });

  it('uses a separate document creation presentation', () => {
    expect(
      resolveTaskDialogOpeningPresentation({
        preferences,
        mode: 'create',
        selectedListStatus: 'documents',
      })
    ).toBe('focused');
  });

  it('uses separate task creation and editing presentations', () => {
    expect(
      resolveTaskDialogOpeningPresentation({
        preferences,
        mode: 'edit',
        selectedListStatus: 'active',
      })
    ).toBe('focused');

    expect(
      resolveTaskDialogOpeningPresentation({
        preferences,
        mode: 'create',
        selectedListStatus: 'active',
      })
    ).toBe('compact');
  });

  it('keeps drafts fullscreen', () => {
    expect(
      resolveTaskDialogOpeningPresentation({
        preferences,
        draftId: 'draft-1',
        mode: 'create',
        selectedListStatus: 'documents',
      })
    ).toBe('fullscreen');
  });
});
