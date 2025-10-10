import { useCallback, useState } from 'react';

export interface TaskDialogState {
  editDialogOpen: boolean;
  deleteDialogOpen: boolean;
  customDateDialogOpen: boolean;
  newLabelDialogOpen: boolean;
  isClosingDialog: boolean;
}

export interface TaskDialogActions {
  openEditDialog: () => void;
  closeEditDialog: () => void;
  handleDialogClose: () => void;
  openDeleteDialog: () => void;
  closeDeleteDialog: () => void;
  openCustomDateDialog: () => void;
  closeCustomDateDialog: () => void;
  openNewLabelDialog: () => void;
  closeNewLabelDialog: () => void;
  isAnyDialogOpen: () => boolean;
}

export function useTaskDialogState() {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customDateDialogOpen, setCustomDateDialogOpen] = useState(false);
  const [newLabelDialogOpen, setNewLabelDialogOpen] = useState(false);
  const [isClosingDialog, setIsClosingDialog] = useState(false);

  // Memoized handler to prevent unnecessary re-renders
  const handleDialogClose = useCallback(() => {
    setIsClosingDialog(true);
    setEditDialogOpen(false);
    // Reset the closing flag after a short delay to allow the dialog to fully close
    setTimeout(() => {
      setIsClosingDialog(false);
    }, 100);
  }, []);

  const openEditDialog = useCallback(() => {
    setEditDialogOpen(true);
    setIsClosingDialog(false);
  }, []);

  const closeEditDialog = useCallback(() => {
    setEditDialogOpen(false);
  }, []);

  const openDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(true);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
  }, []);

  const openCustomDateDialog = useCallback(() => {
    setCustomDateDialogOpen(true);
  }, []);

  const closeCustomDateDialog = useCallback(() => {
    setCustomDateDialogOpen(false);
  }, []);

  const openNewLabelDialog = useCallback(() => {
    setNewLabelDialogOpen(true);
  }, []);

  const closeNewLabelDialog = useCallback(() => {
    setNewLabelDialogOpen(false);
  }, []);

  const isAnyDialogOpen = useCallback(() => {
    return (
      editDialogOpen ||
      deleteDialogOpen ||
      customDateDialogOpen ||
      newLabelDialogOpen
    );
  }, [
    editDialogOpen,
    deleteDialogOpen,
    customDateDialogOpen,
    newLabelDialogOpen,
  ]);

  const state: TaskDialogState = {
    editDialogOpen,
    deleteDialogOpen,
    customDateDialogOpen,
    newLabelDialogOpen,
    isClosingDialog,
  };

  const actions: TaskDialogActions = {
    openEditDialog,
    closeEditDialog,
    handleDialogClose,
    openDeleteDialog,
    closeDeleteDialog,
    openCustomDateDialog,
    closeCustomDateDialog,
    openNewLabelDialog,
    closeNewLabelDialog,
    isAnyDialogOpen,
  };

  return { state, actions };
}
