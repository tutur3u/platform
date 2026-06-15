import { describe, expect, it } from 'vitest';
import { resolveTaskDialogOpeningPresentation } from './task-dialog-presentation';

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
        defaultPresentation: 'fullscreen',
        mode: 'edit',
        selectedListStatus: 'not_started',
      })
    ).toBe('fullscreen');
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
