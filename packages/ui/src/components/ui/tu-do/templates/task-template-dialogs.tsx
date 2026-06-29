'use client';

import type {
  WorkspaceTaskBoardListItem,
  WorkspaceTaskListSummary,
} from '@tuturuuu/internal-api/tasks';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import type {
  WorkspaceTaskTemplate,
  WorkspaceTaskTemplatePayload,
} from './task-template-api';

type Visibility = 'private' | 'workspace';

interface CreateTaskTemplateDialogProps {
  onCreate: (payload: WorkspaceTaskTemplatePayload) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
}

export function CreateTaskTemplateDialog({
  onCreate,
  onOpenChange,
  open,
  pending,
}: CreateTaskTemplateDialogProps) {
  const t = useTranslations('ws-task-templates');
  const nameId = useId();
  const keyId = useId();
  const taskNameId = useId();
  const descriptionId = useId();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<string>('none');
  const [visibility, setVisibility] = useState<Visibility>('private');

  useEffect(() => {
    if (!open) return;
    setName('');
    setKey('');
    setTaskName('');
    setDescription('');
    setPriority('none');
    setVisibility('private');
  }, [open]);

  const canSubmit = name.trim().length > 0 || taskName.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create.title')}</DialogTitle>
          <DialogDescription>{t('create.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={nameId}>{t('fields.template_name')}</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('fields.template_name_placeholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={keyId}>{t('fields.key')}</Label>
            <Input
              id={keyId}
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder={t('fields.key_placeholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={taskNameId}>{t('fields.task_name')}</Label>
            <Input
              id={taskNameId}
              value={taskName}
              onChange={(event) => setTaskName(event.target.value)}
              placeholder={t('fields.task_name_placeholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={descriptionId}>{t('fields.description')}</Label>
            <Textarea
              id={descriptionId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('fields.description_placeholder')}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue placeholder={t('fields.priority')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('priority.none')}</SelectItem>
                <SelectItem value="low">{t('priority.low')}</SelectItem>
                <SelectItem value="normal">{t('priority.normal')}</SelectItem>
                <SelectItem value="high">{t('priority.high')}</SelectItem>
                <SelectItem value="critical">
                  {t('priority.critical')}
                </SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={visibility}
              onValueChange={(value) => setVisibility(value as Visibility)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('fields.visibility')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">
                  {t('visibility.private')}
                </SelectItem>
                <SelectItem value="workspace">
                  {t('visibility.workspace')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={!canSubmit || pending}
            onClick={() =>
              onCreate({
                description: description.trim() || null,
                key: key.trim() || undefined,
                name: name.trim() || taskName.trim(),
                priority: priority === 'none' ? null : (priority as never),
                task_name: taskName.trim() || name.trim(),
                visibility,
              })
            }
          >
            {t('actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface UseTaskTemplateDialogProps {
  boards: WorkspaceTaskBoardListItem[];
  lists: WorkspaceTaskListSummary[];
  loadingLists: boolean;
  onBoardChange: (boardId: string) => void;
  onListChange: (listId: string) => void;
  onOpenChange: (open: boolean) => void;
  onUse: (payload: { listId: string; name?: string }) => void;
  open: boolean;
  pending: boolean;
  selectedBoardId: string;
  selectedListId: string;
  template: WorkspaceTaskTemplate | null;
}

export function UseTaskTemplateDialog({
  boards,
  lists,
  loadingLists,
  onBoardChange,
  onListChange,
  onOpenChange,
  onUse,
  open,
  pending,
  selectedBoardId,
  selectedListId,
  template,
}: UseTaskTemplateDialogProps) {
  const t = useTranslations('ws-task-templates');
  const overrideNameId = useId();
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('use.title')}</DialogTitle>
          <DialogDescription>
            {template
              ? t('use.description', { name: template.name })
              : t('use.description_empty')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Select value={selectedBoardId} onValueChange={onBoardChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('fields.board')} />
            </SelectTrigger>
            <SelectContent>
              {boards.map((board) => (
                <SelectItem key={board.id} value={board.id}>
                  {board.name || t('fields.unnamed_board')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            disabled={!selectedBoardId || loadingLists}
            onValueChange={onListChange}
            value={selectedListId}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('fields.list')} />
            </SelectTrigger>
            <SelectContent>
              {lists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name || t('fields.unnamed_list')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-2">
            <Label htmlFor={overrideNameId}>{t('fields.override_name')}</Label>
            <Input
              id={overrideNameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={template?.task_name ?? t('fields.task_name')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={!template || !selectedListId || pending}
            onClick={() =>
              onUse({
                listId: selectedListId,
                name: name.trim() || undefined,
              })
            }
          >
            {t('actions.create_task')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SaveTaskTemplateFromTaskDialogProps {
  onOpenChange: (open: boolean) => void;
  onSave: (payload: {
    name?: string;
    taskId: string;
    visibility: Visibility;
  }) => void;
  open: boolean;
  pending: boolean;
}

export function SaveTaskTemplateFromTaskDialog({
  onOpenChange,
  onSave,
  open,
  pending,
}: SaveTaskTemplateFromTaskDialogProps) {
  const t = useTranslations('ws-task-templates');
  const taskIdInput = useId();
  const nameInput = useId();
  const [taskId, setTaskId] = useState('');
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');

  useEffect(() => {
    if (!open) return;
    setTaskId('');
    setName('');
    setVisibility('private');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('save_from_task.title')}</DialogTitle>
          <DialogDescription>
            {t('save_from_task.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={taskIdInput}>{t('fields.task_id')}</Label>
            <Input
              id={taskIdInput}
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              placeholder={t('fields.task_id_placeholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={nameInput}>{t('fields.template_name')}</Label>
            <Input
              id={nameInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('fields.template_name_placeholder')}
            />
          </div>
          <Select
            value={visibility}
            onValueChange={(value) => setVisibility(value as Visibility)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('fields.visibility')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">{t('visibility.private')}</SelectItem>
              <SelectItem value="workspace">
                {t('visibility.workspace')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            disabled={!taskId.trim() || pending}
            onClick={() =>
              onSave({
                name: name.trim() || undefined,
                taskId: taskId.trim(),
                visibility,
              })
            }
          >
            {t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
