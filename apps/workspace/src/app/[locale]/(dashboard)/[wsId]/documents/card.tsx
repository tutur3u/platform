'use client';

import { FileText, MoreHorizontal, Trash2 } from '@tuturuuu/icons';
import type { WorkspaceDocument } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import moment from 'moment';
import 'moment/locale/vi';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useCallback, useState } from 'react';

interface Props {
  wsId: string;
  document: Partial<WorkspaceDocument>;
  onUpdate?: () => void;
}

export const DocumentCard = ({ wsId, document, onUpdate }: Props) => {
  const { id, name, created_at } = document;
  const locale = useLocale();
  const router = useRouter();
  const creationDate = moment(created_at).locale(locale).fromNow();

  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClosingDialog] = useState(false);

  const handleCardClick = useCallback(() => {
    // Don't navigate if clicking on menu or during deletion
    if (menuOpen || deleteDialogOpen || isClosingDialog || isDeleting || !id) {
      return;
    }
    router.push(`/${wsId}/documents/${id}`);
  }, [
    menuOpen,
    deleteDialogOpen,
    isClosingDialog,
    isDeleting,
    id,
    wsId,
    router,
  ]);

  const handleDelete = async () => {
    if (!id) return;

    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/documents/${id}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete document');
      }

      toast.success('Document deleted successfully');
      setDeleteDialogOpen(false);
      onUpdate?.();
      router.refresh();
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Failed to delete document');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card
        onClick={handleCardClick}
        className={cn(
          'group relative overflow-hidden rounded-lg border-l-4 border-l-dynamic-blue/70 bg-dynamic-blue/5 transition-all duration-200',
          'cursor-pointer hover:shadow-md hover:ring-1 hover:ring-primary/15'
        )}
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <button
                  type="button"
                  className="-mx-1 -my-0.5 line-clamp-2 w-full cursor-pointer rounded-sm px-1 py-0.5 text-left font-semibold text-base text-foreground leading-tight transition-colors duration-200 active:bg-muted/50"
                  aria-label={`Open document: ${name}`}
                  title="Click to open document"
                >
                  {name || 'Untitled Document'}
                </button>
              </div>
            </div>
            {/* Actions menu */}
            <div className="flex items-center justify-end gap-1">
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    className={cn(
                      'h-7 w-7 shrink-0 p-0 transition-all duration-200',
                      'hover:scale-105 hover:bg-muted',
                      menuOpen
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100',
                      menuOpen && 'bg-muted ring-1 ring-border'
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56"
                  sideOffset={5}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setDeleteDialogOpen(true);
                      setMenuOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4 text-dynamic-red" />
                    Delete document
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Creation date */}
          <div className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
            <FileText className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">Created {creationDate}</span>
          </div>
        </div>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent
          className="sm:max-w-[425px]"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{name}&quot;? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
