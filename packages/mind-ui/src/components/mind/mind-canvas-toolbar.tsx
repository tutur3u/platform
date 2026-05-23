'use client';

import {
  Check,
  Copy,
  FileJson,
  FileText,
  GitMerge,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Route,
  SlidersHorizontal,
  Trash2,
} from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  MindAutoSaveIsland,
  type MindAutoSaveStatus,
} from './mind-auto-save-island';
import { MindTagFilter } from './mind-tag-filter';
import { MIND_HORIZONS } from './model';

export function MindCanvasToolbar({
  autoSaveStatus,
  boardTitle,
  collapsed,
  deletingBoard,
  disabled,
  horizon,
  onAddNode,
  onCollapsedChange,
  onCopyJson,
  onCopyMarkdown,
  onDeleteBoard,
  onHorizonChange,
  onOrganize,
  onRenameBoard,
  onRelationshipPass,
  onSaveNow,
  onSelectedTagsChange,
  renamingBoard,
  selectedTags,
  tags,
}: {
  autoSaveStatus: MindAutoSaveStatus;
  boardTitle: string;
  collapsed: boolean;
  deletingBoard?: boolean;
  disabled?: boolean;
  horizon: string;
  onAddNode: () => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onCopyJson: () => Promise<void> | void;
  onCopyMarkdown: () => Promise<void> | void;
  onDeleteBoard?: () => Promise<unknown> | unknown;
  onHorizonChange: (value: string) => void;
  onOrganize: () => void;
  onRenameBoard?: (title: string) => Promise<unknown> | unknown;
  onRelationshipPass?: () => void;
  onSaveNow: () => void;
  onSelectedTagsChange: (tags: string[]) => void;
  renamingBoard?: boolean;
  selectedTags: string[];
  tags: string[];
}) {
  const t = useTranslations('mind');
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'json' | 'markdown' | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(boardTitle);

  useEffect(() => {
    if (!editingTitle) setTitleDraft(boardTitle);
  }, [boardTitle, editingTitle]);

  const copyBoard = async (kind: 'json' | 'markdown') => {
    try {
      await (kind === 'json' ? onCopyJson() : onCopyMarkdown());
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  const submitTitle = async () => {
    const nextTitle = titleDraft.trim();
    if (!nextTitle || nextTitle === boardTitle) {
      setTitleDraft(boardTitle);
      setEditingTitle(false);
      return;
    }

    setActionError(null);

    try {
      await onRenameBoard?.(nextTitle);
      setEditingTitle(false);
    } catch {
      setActionError(t('actions.renameBoardError'));
    }
  };

  const deleteBoard = async () => {
    if (!onDeleteBoard) return;
    setActionError(null);

    try {
      await onDeleteBoard();
      setDeleteOpen(false);
    } catch {
      setActionError(t('actions.deleteBoardError'));
    }
  };

  const titleEditor = editingTitle ? (
    <form
      className="min-w-0"
      onSubmit={(event) => {
        event.preventDefault();
        void submitTitle();
      }}
    >
      <Input
        aria-label={t('actions.renameBoard')}
        autoFocus
        className="h-8 w-[min(18rem,calc(100vw-9rem))] border-border/70 bg-background/80 px-2 font-semibold text-base"
        disabled={disabled || renamingBoard}
        onChange={(event) => setTitleDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          setTitleDraft(boardTitle);
          setEditingTitle(false);
        }}
        value={titleDraft}
      />
    </form>
  ) : (
    <button
      aria-label={t('actions.editBoardTitle')}
      className="group flex h-8 min-w-0 max-w-[min(18rem,calc(100vw-9rem))] items-center gap-2 rounded-md px-2 text-left transition hover:bg-muted/70"
      disabled={disabled || !onRenameBoard}
      onClick={() => {
        setActionError(null);
        setEditingTitle(true);
      }}
      type="button"
    >
      <span className="truncate font-semibold text-lg leading-none">
        {boardTitle}
      </span>
      {onRenameBoard ? (
        <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
      ) : null}
    </button>
  );

  const titleSaveButton = editingTitle ? (
    <Button
      aria-label={t('actions.saveBoardTitle')}
      className="h-8 w-8 shrink-0"
      disabled={disabled || renamingBoard || !titleDraft.trim()}
      onClick={() => void submitTitle()}
      size="icon"
      type="button"
      variant="secondary"
    >
      {renamingBoard ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Check className="h-4 w-4" />
      )}
    </Button>
  ) : null;

  const toolbarActions = collapsed ? null : (
    <>
      <div className="mx-1 h-6 w-px bg-border/70" />
      <Button
        aria-label={t('actions.addNode')}
        className="h-8 gap-1.5"
        disabled={disabled}
        onClick={onAddNode}
        size="sm"
        type="button"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">{t('actions.addNode')}</span>
      </Button>
      <Button
        aria-label={t('actions.organize')}
        className="h-8 gap-1.5"
        disabled={disabled}
        onClick={onOrganize}
        size="sm"
        type="button"
        variant="secondary"
      >
        <GitMerge className="h-4 w-4" />
        <span className="hidden md:inline">{t('actions.organize')}</span>
      </Button>
      {onRelationshipPass ? (
        <Button
          aria-label={t('actions.relationships')}
          className="h-8 gap-1.5"
          disabled={disabled}
          onClick={onRelationshipPass}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Route className="h-4 w-4" />
          <span className="hidden lg:inline">{t('actions.relationships')}</span>
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t('actions.exportBoard')}
            className="h-8 gap-1.5"
            disabled={disabled}
            size="sm"
            type="button"
            variant="secondary"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            <span className="hidden lg:inline">{t('actions.exportBoard')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onSelect={() => void copyBoard('markdown')}>
            <FileText className="h-4 w-4" />
            {copied === 'markdown'
              ? t('actions.copiedMarkdown')
              : t('actions.copyMarkdown')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyBoard('json')}>
            <FileJson className="h-4 w-4" />
            {copied === 'json'
              ? t('actions.copiedJson')
              : t('actions.copyJson')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Select onValueChange={onHorizonChange} value={horizon}>
        <SelectTrigger className="h-8 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('horizons.all')}</SelectItem>
          {MIND_HORIZONS.map((item) => (
            <SelectItem key={item} value={item}>
              {t(`horizons.${item}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );

  const boardActionsMenu =
    onRenameBoard || onDeleteBoard ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t('actions.boardActions')}
            className="h-8 w-8 shrink-0"
            disabled={disabled || deletingBoard || renamingBoard}
            size="icon"
            type="button"
            variant="ghost"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {onRenameBoard ? (
            <DropdownMenuItem
              onSelect={() => {
                setActionError(null);
                setEditingTitle(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              {t('actions.renameBoard')}
            </DropdownMenuItem>
          ) : null}
          {onRenameBoard && onDeleteBoard ? <DropdownMenuSeparator /> : null}
          {onDeleteBoard ? (
            <DropdownMenuItem
              className="text-dynamic-red focus:text-dynamic-red"
              onSelect={(event) => {
                event.preventDefault();
                setActionError(null);
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              {t('actions.deleteBoard')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <>
      <div className="absolute top-3 left-3 z-30 flex max-w-[calc(100vw-6rem)] flex-wrap items-center gap-1 rounded-xl border border-border bg-background/90 p-1 shadow-lg backdrop-blur">
        {titleEditor}
        {titleSaveButton}
        <MindAutoSaveIsland
          inline
          onSaveNow={onSaveNow}
          status={autoSaveStatus}
        />
        <MindTagFilter
          align="start"
          compact
          onSelectedTagsChange={onSelectedTagsChange}
          selectedTags={selectedTags}
          tags={tags}
        />
        <Button
          aria-label={
            collapsed ? t('actions.openToolbar') : t('actions.closeToolbar')
          }
          className="h-8 w-8 shrink-0 touch-manipulation"
          onClick={() => onCollapsedChange(!collapsed)}
          size="icon"
          type="button"
          variant={collapsed ? 'ghost' : 'secondary'}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
        {toolbarActions}
        {boardActionsMenu}
      </div>
      {actionError ? (
        <div className="absolute top-14 left-3 z-30 max-w-[min(26rem,calc(100vw-1.5rem))] rounded-md border border-dynamic-red/30 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-xs shadow-lg backdrop-blur">
          {actionError}
        </div>
      ) : null}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('actions.deleteBoardTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('actions.deleteBoardDescription', { title: boardTitle })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBoard}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="border border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/15"
              disabled={deletingBoard}
              onClick={(event) => {
                event.preventDefault();
                void deleteBoard();
              }}
            >
              {deletingBoard ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t('actions.deleteBoard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
