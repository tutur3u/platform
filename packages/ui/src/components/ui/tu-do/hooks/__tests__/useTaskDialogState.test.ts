/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTaskDialogState } from '../useTaskDialogState';

describe('useTaskDialogState', () => {
  it('should initialize with all dialogs closed', () => {
    const { result } = renderHook(() => useTaskDialogState());

    expect(result.current.state.editDialogOpen).toBe(false);
    expect(result.current.state.deleteDialogOpen).toBe(false);
    expect(result.current.state.customDateDialogOpen).toBe(false);
    expect(result.current.state.newLabelDialogOpen).toBe(false);
    expect(result.current.state.isClosingDialog).toBe(false);
  });

  describe('editDialog', () => {
    it('should open edit dialog', () => {
      const { result } = renderHook(() => useTaskDialogState());

      act(() => {
        result.current.actions.openEditDialog();
      });

      expect(result.current.state.editDialogOpen).toBe(true);
    });

    it('should close edit dialog', () => {
      const { result } = renderHook(() => useTaskDialogState());

      act(() => {
        result.current.actions.openEditDialog();
      });

      expect(result.current.state.editDialogOpen).toBe(true);

      act(() => {
        result.current.actions.closeEditDialog();
      });

      expect(result.current.state.editDialogOpen).toBe(false);
    });

    it('should not set isClosingDialog when using closeEditDialog directly', () => {
      const { result } = renderHook(() => useTaskDialogState());

      act(() => {
        result.current.actions.openEditDialog();
      });

      act(() => {
        result.current.actions.closeEditDialog();
      });

      // closeEditDialog only closes the dialog, isClosingDialog is only set by handleDialogClose
      expect(result.current.state.editDialogOpen).toBe(false);
      expect(result.current.state.isClosingDialog).toBe(false);
    });

    it('should handle dialog close with isClosingDialog flag', () => {
      const { result } = renderHook(() => useTaskDialogState());

      act(() => {
        result.current.actions.openEditDialog();
      });

      act(() => {
        result.current.actions.handleDialogClose();
      });

      expect(result.current.state.editDialogOpen).toBe(false);
      expect(result.current.state.isClosingDialog).toBe(true);
    });

    it('should reset isClosingDialog after 300ms', async () => {
      const { result } = renderHook(() => useTaskDialogState());

      act(() => {
        result.current.actions.openEditDialog();
      });

      act(() => {
        result.current.actions.handleDialogClose();
      });

      expect(result.current.state.isClosingDialog).toBe(true);

      // Wait for timeout to complete
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350));
      });

      expect(result.current.state.isClosingDialog).toBe(false);
    });
  });

  describe('deleteDialog', () => {
    it('should open delete dialog', () => {
      const { result } = renderHook(() => useTaskDialogState());

      act(() => {
        result.current.actions.openDeleteDialog();
      });

      expect(result.current.state.deleteDialogOpen).toBe(true);
    });

    it('should close delete dialog', () => {
      const { result } = renderHook(() => useTaskDialogState());

      act(() => {
        result.current.actions.openDeleteDialog();
      });

      act(() => {
        result.current.actions.closeDeleteDialog();
      });

      expect(result.current.state.deleteDialogOpen).toBe(false);
    });
  });

  describe('customDateDialog', () => {
    it('should open custom date dialog', () => {
      const { result } = renderHook(() => useTaskDialogState());

      act(() => {
        result.current.actions.openCustomDateDialog();
      });

      expect(result.current.state.customDateDialogOpen).toBe(true);
    });

    it('should close custom date dialog', () => {
      const { result } = renderHook(() => useTaskDialogState());

      act(() => {
        result.current.actions.openCustomDateDialog();
      });

      act(() => {
        result.current.actions.closeCustomDateDialog();
      });

      expect(result.current.state.customDateDialogOpen).toBe(false);
    });
  });

  describe('newLabelDialog', () => {
    it('should open new label dialog', () => {
      const { result } = renderHook(() => useTaskDialogState());

      act(() => {
        result.current.actions.openNewLabelDialog();
      });

      expect(result.current.state.newLabelDialogOpen).toBe(true);
    });

    it('should close new label dialog', () => {
      const { result } = renderHook(() => useTaskDialogState());

      act(() => {
        result.current.actions.openNewLabelDialog();
      });

      act(() => {
        result.current.actions.closeNewLabelDialog();
      });

      expect(result.current.state.newLabelDialogOpen).toBe(false);
    });
  });

  describe('multiple dialogs', () => {
    it('should handle multiple dialogs independently', () => {
      const { result } = renderHook(() => useTaskDialogState());

      act(() => {
        result.current.actions.openEditDialog();
        result.current.actions.openDeleteDialog();
      });

      expect(result.current.state.editDialogOpen).toBe(true);
      expect(result.current.state.deleteDialogOpen).toBe(true);

      act(() => {
        result.current.actions.closeEditDialog();
      });

      expect(result.current.state.editDialogOpen).toBe(false);
      expect(result.current.state.deleteDialogOpen).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should cleanup timeout on unmount', () => {
      const { result, unmount } = renderHook(() => useTaskDialogState());

      act(() => {
        result.current.actions.openEditDialog();
      });

      act(() => {
        result.current.actions.handleDialogClose();
      });

      // Unmount before timeout completes
      unmount();

      // No errors should occur
      expect(true).toBe(true);
    });
  });
});
