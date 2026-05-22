'use client';

import {
  Check,
  Copy,
  FileJson,
  FileText,
  GitMerge,
  Plus,
  Route,
  Save,
  SlidersHorizontal,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MIND_HORIZONS } from './model';

export function MindCanvasToolbar({
  collapsed,
  disabled,
  horizon,
  onAddNode,
  onCollapsedChange,
  onCopyJson,
  onCopyMarkdown,
  onHorizonChange,
  onOrganize,
  onRelationshipPass,
  onSave,
  saving,
}: {
  collapsed: boolean;
  disabled?: boolean;
  horizon: string;
  onAddNode: () => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onCopyJson: () => Promise<void> | void;
  onCopyMarkdown: () => Promise<void> | void;
  onHorizonChange: (value: string) => void;
  onOrganize: () => void;
  onRelationshipPass?: () => void;
  onSave: () => void;
  saving?: boolean;
}) {
  const t = useTranslations('mind');
  const [copied, setCopied] = useState<'json' | 'markdown' | null>(null);

  const copyBoard = async (kind: 'json' | 'markdown') => {
    try {
      await (kind === 'json' ? onCopyJson() : onCopyMarkdown());
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  if (collapsed) {
    return (
      <div className="absolute top-24 left-3 z-30 flex items-center gap-2 rounded-xl border border-border bg-background/90 p-1 shadow-lg backdrop-blur">
        <Button
          aria-label={t('actions.openToolbar')}
          className="h-9 w-9 touch-manipulation"
          onClick={() => onCollapsedChange(false)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="absolute top-24 left-3 z-30 flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background/90 p-1.5 shadow-lg backdrop-blur">
      <Button
        aria-label={t('actions.closeToolbar')}
        className="h-8 w-8"
        onClick={() => onCollapsedChange(true)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <SlidersHorizontal className="h-4 w-4" />
      </Button>
      <Button disabled={disabled} onClick={onAddNode} size="sm" type="button">
        <Plus className="h-4 w-4" />
        {t('actions.addNode')}
      </Button>
      <Button
        disabled={disabled}
        onClick={onOrganize}
        size="sm"
        type="button"
        variant="secondary"
      >
        <GitMerge className="h-4 w-4" />
        {t('actions.organize')}
      </Button>
      {onRelationshipPass ? (
        <Button
          disabled={disabled}
          onClick={onRelationshipPass}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Route className="h-4 w-4" />
          {t('actions.relationships')}
        </Button>
      ) : null}
      <Button
        disabled={disabled || saving}
        onClick={onSave}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Save className="h-4 w-4" />
        {saving ? t('actions.saving') : t('actions.save')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t('actions.exportBoard')}
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
            {t('actions.exportBoard')}
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
        <SelectTrigger className="h-8 w-36">
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
    </div>
  );
}
