'use client';

import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
} from '@tuturuuu/icons';
import type { ExternalProjectEntry } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import type { CmsStrings } from '../../cms-strings';
import { formatStatus, statusTone } from './entry-detail-shared';

type EntryDetailHeaderProps = {
  activeEntry: ExternalProjectEntry;
  activeEntryTitle: string;
  collectionTitle: string;
  coverVisible: boolean;
  dirty: boolean;
  featuredPlacementActive: boolean;
  featuredPlacementIndex: number;
  featuredPlacementLabel: string | null;
  featuredPlacementProcessing: boolean;
  mediaProcessing: boolean;
  onBack: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onOpenPreview: () => void;
  onPublishToggle: () => void;
  onRefresh: () => void;
  onSave: () => void;
  onToggleFeaturedPlacement: () => void;
  publishPending: boolean;
  saveDisabled: boolean;
  saveProcessing: boolean;
  strings: CmsStrings;
  variant: 'dialog' | 'page';
};

export function EntryDetailHeader({
  activeEntry,
  activeEntryTitle,
  collectionTitle,
  coverVisible,
  dirty,
  featuredPlacementActive,
  featuredPlacementIndex,
  featuredPlacementLabel,
  featuredPlacementProcessing,
  mediaProcessing,
  onBack,
  onDelete,
  onDuplicate,
  onOpenPreview,
  onPublishToggle,
  onRefresh,
  onSave,
  onToggleFeaturedPlacement,
  publishPending,
  saveDisabled,
  saveProcessing,
  strings,
  variant,
}: EntryDetailHeaderProps) {
  const published = activeEntry.status === 'published';

  return (
    <div className="sticky top-0 z-[60] -mx-2 overflow-hidden rounded-2xl border border-border/70 bg-background/92 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-background/78 sm:mx-0">
      <div className="flex flex-col gap-3 px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-2 sm:gap-3">
          {variant === 'page' ? (
            <Button
              aria-label={strings.backToEpmAction}
              className="mt-0.5 shrink-0"
              size="icon"
              variant="ghost"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : null}
          <div className="min-w-0 space-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="max-w-full truncate font-semibold text-xl tracking-tight sm:text-2xl">
                {activeEntryTitle}
              </h1>
              <Badge className={statusTone(activeEntry.status)}>
                {formatStatus(activeEntry.status, strings)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="outline" className="font-normal">
                {collectionTitle}
              </Badge>
              <span className="max-w-[18rem] truncate rounded-md bg-muted/70 px-2 py-1 font-mono text-muted-foreground">
                /{activeEntry.slug}
              </span>
              {coverVisible ? (
                <Badge variant="outline" className="font-normal">
                  {strings.coverBadge}
                </Badge>
              ) : null}
              {featuredPlacementLabel && featuredPlacementActive ? (
                <Badge variant="secondary" className="font-normal">
                  {featuredPlacementLabel} · {featuredPlacementIndex + 1}
                </Badge>
              ) : null}
              {mediaProcessing ? (
                <Badge
                  variant="outline"
                  className="border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue"
                >
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {strings.mediaProcessingLabel}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
          <Badge
            variant="outline"
            className={
              dirty
                ? 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange'
                : 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
            }
          >
            {dirty ? (
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            {dirty ? strings.editorUnsavedLabel : strings.editorSavedLabel}
          </Badge>
          <Button
            aria-label={strings.openPreviewAction}
            size="sm"
            variant="outline"
            onClick={onOpenPreview}
          >
            <Eye className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">
              {strings.openPreviewAction}
            </span>
          </Button>
          <Button
            size="sm"
            variant={dirty ? 'default' : 'outline'}
            disabled={saveDisabled}
            onClick={onSave}
          >
            {saveProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Pencil className="mr-2 h-4 w-4" />
            )}
            {strings.saveAction}
          </Button>
          <Button
            size="sm"
            disabled={publishPending || saveProcessing}
            onClick={onPublishToggle}
          >
            {publishPending || saveProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : published ? (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {published ? strings.unpublishAction : strings.publishAction}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={strings.moreActionsLabel}
                size="icon"
                variant="outline"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={onRefresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {strings.refreshAction}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                {strings.duplicateAction}
              </DropdownMenuItem>
              {featuredPlacementLabel ? (
                <DropdownMenuItem
                  disabled={featuredPlacementProcessing}
                  onSelect={onToggleFeaturedPlacement}
                >
                  {featuredPlacementProcessing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {featuredPlacementActive
                    ? strings.featuredPlacementRemoveAction
                    : strings.featuredPlacementAddAction}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={onDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {strings.deleteEntryAction}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
