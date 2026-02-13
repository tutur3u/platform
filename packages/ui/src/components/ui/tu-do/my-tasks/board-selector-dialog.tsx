'use client';

import { LayoutDashboard, ListTodo, Users } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';

interface BoardSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPersonal: boolean;
  workspacesData:
    | Array<{
        id: string;
        name: string | null;
        personal: boolean | null;
      }>
    | undefined;
  selectedWorkspaceId: string;
  onWorkspaceChange: (id: string) => void;
  boardsData: any[];
  boardsLoading: boolean;
  selectedBoardId: string;
  onBoardChange: (id: string) => void;
  availableLists: any[];
  selectedListId: string;
  onListChange: (id: string) => void;
  taskCreatorMode: 'simple' | 'ai' | null;
  aiFlowStep?: 'idle' | 'reviewing' | 'selecting-destination';
  onConfirm: () => void;
  onCreateBoard: (name: string) => void;
  onCreateList: (name: string) => void;
  submitShortcut?: 'enter' | 'cmd_enter';
}

export function BoardSelectorDialog({
  open,
  onOpenChange,
  isPersonal,
  workspacesData,
  selectedWorkspaceId,
  onWorkspaceChange,
  boardsData,
  boardsLoading,
  selectedBoardId,
  onBoardChange,
  availableLists,
  selectedListId,
  onListChange,
  taskCreatorMode,
  aiFlowStep,
  onConfirm,
  onCreateBoard,
  onCreateList,
  submitShortcut = 'enter',
}: BoardSelectorDialogProps) {
  const t = useTranslations();

  const contentRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const isModifier = e.metaKey || e.ctrlKey;

      // When submitShortcut is 'cmd_enter', only modifier+Enter submits
      if (submitShortcut === 'cmd_enter' && !isModifier) return;

      // Plain Enter: skip if inside combobox inputs, textareas, or listboxes
      if (!isModifier) {
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.getAttribute('role') === 'combobox' ||
          target.closest('[role="listbox"]')
        ) {
          return;
        }
      }
      // Cmd/Ctrl+Enter always submits; plain Enter submits from non-input elements
      if (selectedListId) {
        e.preventDefault();
        onConfirm();
      }
    },
    [selectedListId, onConfirm, submitShortcut]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        className="sm:max-w-md"
        onKeyDown={handleKeyDown}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          contentRef.current?.focus();
        }}
        tabIndex={-1}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/10">
              <LayoutDashboard className="h-4 w-4 text-dynamic-orange" />
            </div>
            Select Board & List
          </DialogTitle>
          <DialogDescription>
            {aiFlowStep === 'selecting-destination'
              ? 'Choose where to save your reviewed tasks'
              : 'Choose where to create your new task'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Workspace Selection */}
          {isPersonal && workspacesData && workspacesData.length > 0 && (
            <div className="space-y-2">
              <Label
                htmlFor="workspace-select"
                className="flex items-center gap-2"
              >
                <Users className="h-4 w-4 text-muted-foreground" />
                Workspace
              </Label>
              <Select
                value={selectedWorkspaceId}
                onValueChange={onWorkspaceChange}
              >
                <SelectTrigger id="workspace-select" className="w-full">
                  <SelectValue placeholder="Select a workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspacesData.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {workspace.name || 'Unnamed Workspace'}
                      {workspace.personal && ' (Personal)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Board Selection */}
          <div className="space-y-2">
            <Label htmlFor="board-select" className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
              Board
            </Label>
            <Combobox
              t={t}
              mode="single"
              options={boardsData.map((board: any) => ({
                value: board.id,
                label: board.name || 'Unnamed Board',
              }))}
              label={boardsLoading ? 'Loading...' : undefined}
              placeholder="Select a board"
              selected={selectedBoardId}
              onChange={(value) => onBoardChange(value as string)}
              onCreate={onCreateBoard}
              disabled={boardsLoading}
              className="w-full"
            />
          </div>

          {/* List Selection */}
          <div className="space-y-2">
            <Label htmlFor="list-select" className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-muted-foreground" />
              List
            </Label>
            <Combobox
              t={t}
              mode="single"
              options={availableLists.map((list: any) => ({
                value: list.id,
                label: list.name || 'Unnamed List',
              }))}
              placeholder={
                !selectedBoardId
                  ? 'Select a board first'
                  : 'Select or create a list'
              }
              selected={selectedListId}
              onChange={(value) => onListChange(value as string)}
              onCreate={onCreateList}
              disabled={!selectedBoardId}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!selectedListId}>
            {aiFlowStep === 'selecting-destination'
              ? 'Save Tasks'
              : taskCreatorMode
                ? 'Create task'
                : 'Continue'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
