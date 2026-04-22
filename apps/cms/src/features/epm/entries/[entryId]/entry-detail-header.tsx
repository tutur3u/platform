'use client';

import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Eye,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from '@tuturuuu/icons';
import type { ExternalProjectEntry } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import type { EpmStrings } from '../../epm-strings';
import { ActionButton, formatStatus, statusTone } from './entry-detail-shared';

type EntryDetailHeaderProps = {
  activeEntry: ExternalProjectEntry;
  activeEntryTitle: string;
  collectionTitle: string;
  coverVisible: boolean;
  dashboardPath: string;
  dirty: boolean;
  featuredPlacementActive: boolean;
  featuredPlacementIndex: number;
  featuredPlacementLabel: string | null;
  featuredPlacementProcessing: boolean;
  mediaProcessing: boolean;
  onBack: (path: string) => void;
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
  strings: EpmStrings;
  variant: 'dialog' | 'page';
};

export function EntryDetailHeader({
  activeEntry,
  activeEntryTitle,
  collectionTitle,
  coverVisible,
  dashboardPath,
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
  return (
    <div className="sticky top-0 z-[60] -mx-2 rounded-[1.45rem] border border-border/70 bg-background/92 px-4 py-3 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-background/78 sm:mx-0 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-4xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {variant === 'page' ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onBack(dashboardPath)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {strings.backToEpmAction}
              </Button>
            ) : null}
            <Badge variant="outline">{collectionTitle}</Badge>
            <Badge className={statusTone(activeEntry.status)}>
              {formatStatus(activeEntry.status, strings)}
            </Badge>
            {coverVisible ? (
              <Badge variant="outline">{strings.coverBadge}</Badge>
            ) : null}
            {featuredPlacementLabel ? (
              <Badge variant={featuredPlacementActive ? 'default' : 'outline'}>
                {featuredPlacementActive
                  ? `${featuredPlacementLabel} · ${featuredPlacementIndex + 1}`
                  : featuredPlacementLabel}
              </Badge>
            ) : null}
            {dirty ? (
              <Badge variant="outline">{strings.saveAction}</Badge>
            ) : null}
            {mediaProcessing ? (
              <Badge
                variant="outline"
                className="border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue"
              >
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                {strings.mediaProcessingLabel}
              </Badge>
            ) : null}
          </div>
          <div className="space-y-1">
            <h1 className="font-semibold text-[2rem] leading-none tracking-tight">
              {activeEntryTitle}
            </h1>
            <p className="max-w-2xl text-muted-foreground text-sm leading-5">
              {activeEntry.slug}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/88 p-1.5">
          <ActionButton
            tooltip={strings.refreshAction}
            size="sm"
            variant="outline"
            onClick={onRefresh}
          >
            <RefreshCw className="h-4 w-4" />
          </ActionButton>
          <ActionButton
            tooltip={strings.openPreviewAction}
            size="sm"
            variant="outline"
            onClick={onOpenPreview}
          >
            <Eye className="mr-2 h-4 w-4" />
            {strings.openPreviewAction}
          </ActionButton>
          <ActionButton
            tooltip={strings.duplicateAction}
            size="sm"
            variant="outline"
            onClick={onDuplicate}
          >
            <Copy className="mr-2 h-4 w-4" />
            {strings.duplicateAction}
          </ActionButton>
          {featuredPlacementLabel ? (
            <Button
              size="sm"
              variant={featuredPlacementActive ? 'default' : 'outline'}
              disabled={featuredPlacementProcessing}
              onClick={onToggleFeaturedPlacement}
            >
              {featuredPlacementProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {featuredPlacementActive
                ? strings.featuredPlacementRemoveAction
                : strings.featuredPlacementAddAction}
            </Button>
          ) : null}
          <Button size="sm" disabled={saveDisabled} onClick={onSave}>
            {saveProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Pencil className="mr-2 h-4 w-4" />
            )}
            {strings.saveAction}
          </Button>
          <ActionButton
            size="sm"
            tooltip={
              activeEntry.status === 'published'
                ? strings.unpublishAction
                : strings.publishAction
            }
            disabled={publishPending}
            onClick={onPublishToggle}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {activeEntry.status === 'published'
              ? strings.unpublishAction
              : strings.publishAction}
          </ActionButton>
          <ActionButton
            tooltip={strings.deleteEntryAction}
            size="sm"
            variant="outline"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
