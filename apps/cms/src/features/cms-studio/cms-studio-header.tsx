'use client';

import {
  Ellipsis,
  FolderSync,
  Layers2,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from '@tuturuuu/icons';
import type { ExternalProjectCollection } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import type { CmsStrings } from './cms-strings';
import type { CmsStudioMode } from './cms-studio-utils';

export function CmsStudioHeader({
  activeCollection,
  description,
  importPending,
  mode,
  onCreateCollection,
  onCreateEntry,
  onDeleteCollection,
  onEditCollection,
  onImport,
  onModeChange,
  onRefresh,
  showModeSwitch,
  strings,
  title,
}: {
  activeCollection: ExternalProjectCollection | null;
  description: string;
  importPending: boolean;
  mode: CmsStudioMode;
  onCreateCollection: () => void;
  onCreateEntry: () => void;
  onDeleteCollection: (collectionId: string) => void;
  onEditCollection: (collectionId: string) => void;
  onImport: () => void;
  onModeChange: (mode: CmsStudioMode) => void;
  onRefresh: () => void;
  showModeSwitch: boolean;
  strings: CmsStrings;
  title?: string;
}) {
  return (
    <section className="flex flex-wrap items-start justify-between gap-4 rounded-[1.5rem] border border-border/70 bg-card/95 px-4 py-4 shadow-none sm:px-5">
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          {title ?? strings.title}
        </h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      <div className="flex items-center gap-2">
        {showModeSwitch ? (
          <div
            data-testid="cms-mode-switch"
            className="inline-flex rounded-xl border border-border/70 bg-background/70 p-1"
          >
            <Button
              size="sm"
              variant={mode === 'preview' ? 'default' : 'ghost'}
              onClick={() => onModeChange('preview')}
            >
              {strings.previewModeLabel}
            </Button>
            <Button
              size="sm"
              variant={mode === 'edit' ? 'default' : 'ghost'}
              onClick={() => onModeChange('edit')}
            >
              {strings.editModeLabel}
            </Button>
          </div>
        ) : null}

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label={strings.manageCollectionAction}
            >
              <Ellipsis className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={onCreateEntry}>
              <Plus className="mr-2 h-4 w-4" />
              {strings.createEntryAction}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCreateCollection}>
              <Layers2 className="mr-2 h-4 w-4" />
              {strings.createCollectionAction}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={importPending} onClick={onImport}>
              <FolderSync className="mr-2 h-4 w-4" />
              {strings.importAction}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {strings.refreshAction}
            </DropdownMenuItem>
            {activeCollection ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onEditCollection(activeCollection.id)}
                >
                  <Settings2 className="mr-2 h-4 w-4" />
                  {strings.editCollectionAction}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDeleteCollection(activeCollection.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {strings.deleteCollectionAction}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  );
}
