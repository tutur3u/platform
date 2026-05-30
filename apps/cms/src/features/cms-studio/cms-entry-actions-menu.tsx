'use client';

import { CheckCircle2, Copy, Ellipsis, Pencil, Trash2 } from '@tuturuuu/icons';
import type { ExternalProjectEntry } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import type { PublishMutationPayload } from './cms-library-section-shared';
import type { CmsStrings } from './cms-strings';

export function CmsEntryActionsMenu({
  entry,
  onDeleteEntry,
  onDuplicateEntry,
  onOpenEntry,
  onPublishEntry,
  strings,
}: {
  entry: ExternalProjectEntry;
  onDeleteEntry: (entryId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
  onOpenEntry: (entryId: string) => void;
  onPublishEntry: (payload: PublishMutationPayload) => void;
  strings: CmsStrings;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-md"
          aria-label={`${entry.title} ${strings.manageCollectionAction}`}
        >
          <Ellipsis className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onOpenEntry(entry.id)}>
          <Pencil className="mr-2 h-4 w-4" />
          {strings.editEntryAction}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDuplicateEntry(entry.id)}>
          <Copy className="mr-2 h-4 w-4" />
          {strings.duplicateAction}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            onPublishEntry({
              entryId: entry.id,
              eventKind: entry.status === 'published' ? 'unpublish' : 'publish',
            })
          }
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {entry.status === 'published'
            ? strings.unpublishAction
            : strings.publishAction}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onDeleteEntry(entry.id)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {strings.deleteEntryAction}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
