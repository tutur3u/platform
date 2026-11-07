import { cn } from '@tuturuuu/utils/format';
import { describe, expect, it } from 'vitest';
import {
  getTaskDialogContentClassName,
  getTaskDialogContentPresentation,
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

  it('opens task edits in the side panel on a board surface', () => {
    const onBoard = { preferences, panelSurface: true };
    expect(
      resolveTaskDialogOpeningPresentation({
        ...onBoard,
        mode: 'edit',
        selectedListStatus: 'active',
      })
    ).toBe('panel');
    expect(
      resolveTaskDialogOpeningPresentation({
        ...onBoard,
        mode: 'create',
        selectedListStatus: 'active',
      })
    ).toBe('compact');
    expect(
      resolveTaskDialogOpeningPresentation({
        ...onBoard,
        mode: 'edit',
        selectedListStatus: 'documents',
      })
    ).toBe(preferences.documentEdit);
    expect(
      resolveTaskDialogOpeningPresentation({
        ...onBoard,
        draftId: 'draft-1',
        mode: 'edit',
      })
    ).toBe('fullscreen');
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

describe('getTaskDialogContentClassName', () => {
  it('picks one class set per presentation', () => {
    const pick = (compact: boolean, focused: boolean, panel: boolean) =>
      getTaskDialogContentClassName({ compact, focused, panel });
    expect(pick(true, true, true)).toContain('max-w-[30rem]');
    expect(pick(false, true, true)).toBe(
      TASK_DIALOG_FOCUSED_CONTENT_CLASS_NAME
    );
    expect(pick(false, false, true)).toContain('--task-panel-width');
    expect(pick(false, false, false)).toBeUndefined();
  });
});

describe('getTaskDialogContentPresentation', () => {
  it('keeps fullscreen, then the panel, else the centred dialog', () => {
    expect(getTaskDialogContentPresentation('fullscreen', true)).toBe(
      'fullscreen'
    );
    expect(getTaskDialogContentPresentation('panel', true)).toBe('panel');
    expect(getTaskDialogContentPresentation('focused', false)).toBe('default');
  });
});
